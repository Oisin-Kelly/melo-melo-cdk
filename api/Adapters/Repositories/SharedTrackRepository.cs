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

        var batch = _dynamoDbService.CreateBatchWritePart<SharedTrackDataModel>();
        var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
        var activityBatch = _dynamoDbService.CreateBatchWritePart<ActivityItemDataModel>();

        foreach (var recipient in addRecipients)
        {
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

        var shareDelta = addRecipients.Count - removedCount;
        if (shareDelta != 0)
        {
            var tx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
            tx.AddSaveItem($"USER#{ownerUsername}", $"TRACK#{normalisedTrackId}",
                CounterExpressions.Add(("shareCount", shareDelta)));
            await _dynamoDbService.ExecuteTransactWriteAsync(tx);
        }
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
