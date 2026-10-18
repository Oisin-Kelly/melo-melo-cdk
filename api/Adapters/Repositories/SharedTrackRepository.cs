using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class SharedTrackRepository : ISharedTrackRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public SharedTrackRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<bool> IsTrackSharedWithUser(string trackId, string userId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var sharedResult = await _dynamoDbService.GetFromDynamoAsync<SharedTrackDataModel>(
            $"TRACK#{normalisedTrackId}",
            $"SHARED#{userId}"
        );

        return sharedResult != null;
    }

    public async Task<bool> IsTrackSharedWithUserViaAlbum(string trackId, string userId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var grants = await _dynamoDbService.QueryAsync<AlbumTrackGrantDataModel>(
            $"TRACK#{normalisedTrackId}",
            $"SHARED#{userId}#ALBUM#",
            QueryOperator.BeginsWith);

        return grants.Count > 0;
    }

    public async Task<bool> IsTrackAccessibleToUser(string trackId, string userId)
    {
        var directTask = IsTrackSharedWithUser(trackId, userId);
        var albumTask = IsTrackSharedWithUserViaAlbum(trackId, userId);
        await Task.WhenAll(directTask, albumTask);

        return directTask.Result || albumTask.Result;
    }

    public async Task<List<string>> GetTrackRecipientsAsync(string trackId)
    {
        var shares = await GetDirectShareItemsAsync(trackId);
        return shares.Select(s => s.Sk.Replace("SHARED#", "")).ToList();
    }

    public async Task ShareTrackAsync(string trackId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients, string? caption)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var existingShares = await GetDirectShareItemsAsync(normalisedTrackId);
        var existingByRecipient = existingShares
            .ToDictionary(s => s.Sk.Replace("SHARED#", ""), s => s, StringComparer.OrdinalIgnoreCase);
        var removeSet = new HashSet<string>(removeRecipients, StringComparer.OrdinalIgnoreCase);

        var batch = _dynamoDbService.CreateBatchWritePart<SharedTrackDataModel>();
        var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
        var activityBatch = _dynamoDbService.CreateBatchWritePart<ActivityItemDataModel>();

        // Upsert per (track × recipient): a re-share overwrites the record with the current
        // caption + a fresh timestamp (resurface + notify). Only new recipients count.
        var newCount = 0;
        foreach (var recipient in addRecipients)
        {
            // A recipient in both add and remove is contradictory — let remove win (also
            // avoids a put+delete on the same key in one batch).
            if (removeSet.Contains(recipient))
                continue;

            if (!existingByRecipient.ContainsKey(recipient)) newCount++;

            batch.AddPutItem(new SharedTrackDataModel
            {
                Pk = $"TRACK#{normalisedTrackId}",
                Sk = $"SHARED#{recipient}",
                Gsi1Pk = $"SHARED#{recipient}",
                Gsi1Sk = $"DATE#{now}",
                Gsi2Sk = $"SENDER#{ownerUsername}#DATE#{now}",
                TrackOwnerUsername = ownerUsername,
                SharedAt = now,
                Caption = caption,
            });
            feedBatch.AddPutItem(
                FeedItems.Build(recipient, FeedItemType.Track, normalisedTrackId, ownerUsername, now, caption));
            activityBatch.AddPutItem(ActivityItems.Build(recipient, ActivityType.TrackShared, ownerUsername,
                FeedItemType.Track, normalisedTrackId, now));
        }

        var toRemove = existingShares
            .Where(s => removeRecipients.Contains(s.Sk.Replace("SHARED#", ""), StringComparer.OrdinalIgnoreCase))
            .ToList();
        foreach (var share in toRemove)
        {
            batch.AddDeleteItem(share);
            var (pk, sk) = FeedItems.Key(share.Sk.Replace("SHARED#", ""), FeedItemType.Track, normalisedTrackId);
            feedBatch.AddDeleteKey(pk, sk);
        }
        var removedCount = toRemove.Count;

        await _dynamoDbService.ExecuteBatchWriteAsync(batch, feedBatch, activityBatch);

        var shareDelta = newCount - removedCount;
        if (shareDelta != 0)
            await _dynamoDbService.ExecuteTransactWriteAsync(
                CreateShareCountUpdate(ownerUsername, normalisedTrackId, shareDelta));
    }

    // Recipient-side "remove from my library": drops only the direct share of this track with
    // the caller (record + feed item) and decrements the owner's shareCount. Album grants
    // (SHARED#{user}#ALBUM#{id}) are untouched, so a track that is also in a shared album stays
    // accessible via that album. Idempotent — a no-op if the caller has no direct share.
    public async Task RemoveTrackFromLibraryAsync(string trackId, string username)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var share = await _dynamoDbService.GetFromDynamoAsync<SharedTrackDataModel>(
            $"TRACK#{normalisedTrackId}", $"SHARED#{username}");
        if (share is null) return;

        // One transaction, guarded on the share still existing, so a concurrent double-remove
        // decrements shareCount once
        var shareTx = _dynamoDbService.CreateTransactionPart<SharedTrackDataModel>();
        shareTx.AddDeleteKey($"TRACK#{normalisedTrackId}", $"SHARED#{username}", ConditionExpressions.ItemExists());
        var feedTx = _dynamoDbService.CreateTransactionPart<FeedItemDataModel>();
        var (fpk, fsk) = FeedItems.Key(username, FeedItemType.Track, normalisedTrackId);
        feedTx.AddDeleteKey(fpk, fsk);

        var parts = new List<ITransactWrite> { shareTx, feedTx };

        // shareCount tracks the number of direct-share records, so a self-removal must decrement
        // it (kept in sync with the re-share upsert, which counts a missing record as new).
        if (!string.IsNullOrEmpty(share.TrackOwnerUsername))
            parts.Add(CreateShareCountUpdate(share.TrackOwnerUsername, normalisedTrackId, -1));

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }

    private ITransactWrite CreateShareCountUpdate(string ownerUsername, string normalisedTrackId, int delta)
    {
        var tx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
        tx.AddSaveItem($"USER#{ownerUsername}", $"TRACK#{normalisedTrackId}",
            CounterExpressions.Add(("shareCount", delta)));
        return tx;
    }

    public async Task<List<Recipient>> GetTrackRecipientDetailsAsync(string trackId)
    {
        var shares = await GetDirectShareItemsAsync(trackId);
        if (shares.Count == 0)
            return [];

        var keys = shares
            .Select(s => s.Sk.Replace("SHARED#", ""))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var profiles = (await _dynamoDbService.BatchGetAsync<UserDataModel>(keys))
            .ToDictionary(p => p.Username, StringComparer.OrdinalIgnoreCase);

        return shares
            .Where(s => profiles.ContainsKey(s.Sk.Replace("SHARED#", "")))
            .Select(s => new Recipient
            {
                User = UserSummary.From(profiles[s.Sk.Replace("SHARED#", "")]),
                SharedAt = s.SharedAt,
            })
            .OrderByDescending(r => r.SharedAt)
            .ToList();
    }

    private async Task<List<SharedTrackDataModel>> GetDirectShareItemsAsync(string trackId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var shares = await _dynamoDbService.QueryAsync<SharedTrackDataModel>(
            $"TRACK#{normalisedTrackId}",
            "SHARED#",
            QueryOperator.BeginsWith);

        // exclude album shares e.g., SHARED#{user}#ALBUM#{id}
        return shares.Where(s => !s.Sk.Contains("#ALBUM#")).ToList();
    }

    public async Task<PaginatedResult<SharedTrack>> GetTracksSharedWithUser(string userId, int pageSize, string? cursor)
    {
        var (sharedItems, nextToken) = await _dynamoDbService.QueryPaginatedAsync<SharedTrackDataModel>(
            hashKey: $"SHARED#{userId}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (sharedItems.Count == 0)
            return new PaginatedResult<SharedTrack> { Items = [], NextCursor = null };

        var items = await GetSharedTracksFromSharedTrackItems(sharedItems, userId);
        return new PaginatedResult<SharedTrack> { Items = items, NextCursor = nextToken };
    }

    public async Task<PaginatedResult<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId, int pageSize, string? cursor)
    {
        var (sharedItems, nextToken) = await _dynamoDbService.QueryPaginatedAsync<SharedTrackDataModel>(
            hashKey: $"SHARED#{receiverUserId}",
            rangeKey: $"SENDER#{senderUserId}#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI2",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (sharedItems.Count == 0)
            return new PaginatedResult<SharedTrack> { Items = [], NextCursor = null };

        var items = await GetSharedTracksFromSharedTrackItems(sharedItems, receiverUserId);
        return new PaginatedResult<SharedTrack> { Items = items, NextCursor = nextToken };
    }

    public Task<int> CountTracksSharedFromUser(string senderUserId, string receiverUserId)
    {
        return _dynamoDbService.CountAsync(
            hashKey: $"SHARED#{receiverUserId}",
            rangeKeyPrefix: $"SENDER#{senderUserId}#",
            indexName: "GSI2");
    }

    private async Task<List<SharedTrack>> GetSharedTracksFromSharedTrackItems(
        List<SharedTrackDataModel> sharedItems, string viewerUsername)
    {
        var trackRefs = sharedItems
            .Where(item => !string.IsNullOrEmpty(item.TrackOwnerUsername))
            .Select(item => (TrackId: item.Pk.Replace("TRACK#", ""), item.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTrackSummariesAsync(_dynamoDbService, trackRefs, viewerUsername);

        return sharedItems
            .Select(share =>
            {
                var track = tracksById.GetValueOrDefault(share.Pk.Replace("TRACK#", ""));
                return track is null
                    ? null
                    : new SharedTrack { SharedAt = share.SharedAt, Caption = share.Caption, Track = track };
            })
            .OfType<SharedTrack>()
            .ToList();
    }
}
