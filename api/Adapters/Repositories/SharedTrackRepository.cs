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

    public async Task<ShareNote?> GetDirectShareAsync(string trackId, string username)
    {
        var share = await _dynamoDbService.GetFromDynamoAsync<SharedTrackDataModel>(
            $"TRACK#{trackId.ToLowerInvariant()}", $"SHARED#{username}");
        return share is null ? null : new ShareNote { SharedAt = share.SharedAt, Caption = share.Caption };
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
        IReadOnlyList<string> removeRecipients, string? caption, bool notifyRecipients = true)
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
            if (notifyRecipients)
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
                ShareCountUpdate(ownerUsername, normalisedTrackId, shareDelta));
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
            parts.Add(ShareCountUpdate(share.TrackOwnerUsername, normalisedTrackId, -1));

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }

    private ITransactWrite ShareCountUpdate(string ownerUsername, string normalisedTrackId, int delta) =>
        _dynamoDbService.CounterUpdate<TrackDataModel>(Keys.Track(ownerUsername, normalisedTrackId),
            ("shareCount", delta));

    public async Task DeleteSharesForTrackAsync(string trackId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        // Every access record on the track: direct shares (SHARED#{user}) and any album grants
        // (SHARED#{user}#ALBUM#{id}) not already revoked by RemoveTrackFromAllAlbumsAsync
        var accessRecords = await _dynamoDbService.QueryAsync<AlbumTrackGrantDataModel>(
            $"TRACK#{normalisedTrackId}", "SHARED#", QueryOperator.BeginsWith);
        if (accessRecords.Count == 0)
            return;

        // Direct-share recipients each have a feed item; album grants never created one
        var feedKeys = accessRecords
            .Where(r => !r.Sk.Contains("#ALBUM#"))
            .Select(r => FeedItems.Key(r.Sk.Replace("SHARED#", ""), FeedItemType.Track, normalisedTrackId));

        var batch = _dynamoDbService.CreateBatchWritePart<TrackDataModel>();
        foreach (var (pk, sk) in accessRecords.Select(r => (r.Pk, r.Sk)).Concat(feedKeys))
            batch.AddDeleteKey(pk, sk);
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    public async Task<List<Recipient>> GetTrackRecipientDetailsAsync(string trackId)
    {
        var shares = await GetDirectShareItemsAsync(trackId);
        if (shares.Count == 0)
            return [];

        var profiles = await ProfileLookup.GetAsync(_dynamoDbService, shares.Select(s => s.Sk.Replace("SHARED#", "")));

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

    public async Task<List<TrackSummary>> GetLibraryTracksAsync(string username)
    {
        // Own tracks (GSI3), direct shares (GSI1 SHARED#) and album shares (GSI1 ALBUMSHARED#),
        // read in parallel; every page of each
        var ownTask = _dynamoDbService.QueryAsync<TrackDataModel>(
            $"USER#{username}", "DATE#", QueryOperator.BeginsWith, "GSI3");
        var directTask = _dynamoDbService.QueryAsync<SharedTrackDataModel>(
            $"SHARED#{username}", "DATE#", QueryOperator.BeginsWith, "GSI1");
        var albumSharesTask = _dynamoDbService.QueryAsync<AlbumShareDataModel>(
            $"ALBUMSHARED#{username}", "DATE#", QueryOperator.BeginsWith, "GSI1");
        await Task.WhenAll(ownTask, directTask, albumSharesTask);

        // Tracks in shared albums: each album's tracklist (memberships carry the track id;
        // every track in an album is the album owner's)
        var memberships = await Task.WhenAll(albumSharesTask.Result.Select(async share =>
            (Owner: share.AlbumOwnerUsername,
                Members: await AlbumRecords.GetMembershipsAsync(_dynamoDbService, share.AlbumId))));

        var refs = new Dictionary<string, (string TrackId, string OwnerUsername)>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in directTask.Result.Where(i => !string.IsNullOrEmpty(i.TrackOwnerUsername)))
        {
            var trackId = item.Pk.Replace("TRACK#", "");
            refs.TryAdd(trackId, (trackId, item.TrackOwnerUsername));
        }
        foreach (var (owner, members) in memberships)
            foreach (var member in members)
                refs.TryAdd(member.TrackId, (member.TrackId, owner));
        // Own tracks are already full rows; drop them from the lookup
        foreach (var own in ownTask.Result)
            refs.Remove(own.TrackId);

        var sharedTask = TrackBatchLookup.GetTrackSummariesAsync(_dynamoDbService, refs.Values.ToList(), username);
        var ownSummariesTask = OwnSummariesAsync(ownTask.Result, username);
        await Task.WhenAll(sharedTask, ownSummariesTask);

        return ownSummariesTask.Result
            .Concat(sharedTask.Result.Values)
            .OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<List<TrackSummary>> OwnSummariesAsync(List<TrackDataModel> tracks, string username)
    {
        if (tracks.Count == 0) return [];
        var ownerTask = ProfileLookup.GetAsync(_dynamoDbService, [username]);
        var likedTask = TrackBatchLookup.GetLikedTrackIdsAsync(
            _dynamoDbService, username, tracks.Select(t => t.TrackId).ToList());
        await Task.WhenAll(ownerTask, likedTask);
        if (!ownerTask.Result.TryGetValue(username, out var owner)) return [];
        return tracks.Select(t => TrackSummary.From(t, owner, likedTask.Result.Contains(t.TrackId))).ToList();
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
