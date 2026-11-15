using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class PlaylistRepository : IPlaylistRepository
{
    public const string LikesPlaylistId = "likes";
    private const string LikesPlaylistName = "Likes";

    // Sorts after any real 13-digit ms timestamp, so likes is always the first
    // item on the first page of the newest-first GSI3 listing
    private const string LikesGsi3SortKey = "DATE#9999999999999";

    private readonly IDynamoDBService _dynamoDbService;

    public PlaylistRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<Playlist>> GetPlaylistsAsync(string username, int pageSize, string? cursor)
    {
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<PlaylistDataModel>(
            hashKey: $"PLAYLISTS#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        return new PaginatedResult<Playlist>
        {
            Items = items.Select(ToPlaylist).ToList(),
            NextCursor = nextToken,
        };
    }

    public async Task<List<Playlist>> GetPlaylistsContainingTrackAsync(string username, string trackId)
    {
        // Memberships are keyed by playlist, so: every playlist of theirs (the base-table
        // metas, unpaged), then one BatchGet probing each one's TRACK#{id} key
        var playlists = (await _dynamoDbService.QueryAsync<PlaylistDataModel>(
                $"USER#{username}", "PLAYLIST#", QueryOperator.BeginsWith))
            .Where(p => p.Type == PlaylistType.Custom)
            .ToList();
        if (playlists.Count == 0)
            return [];

        var normalisedTrackId = trackId.ToLowerInvariant();
        var memberships = await _dynamoDbService.BatchGetAsync<PlaylistTrackDataModel>(
            playlists.Select(p => (pk: $"PLAYLIST#{p.PlaylistId}", sk: $"TRACK#{normalisedTrackId}")));
        var containing = memberships.Select(m => m.Pk.Replace("PLAYLIST#", "")).ToHashSet();

        return playlists
            .Where(p => containing.Contains(p.PlaylistId))
            .OrderByDescending(p => p.CreatedAt)
            .Select(ToPlaylist)
            .ToList();
    }

    public async Task<Playlist?> GetPlaylistAsync(string username, string playlistId)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var item = await _dynamoDbService.GetFromDynamoAsync<PlaylistDataModel>(
            $"USER#{username}", $"PLAYLIST#{normalisedId}");

        return item is not null ? ToPlaylist(item) : null;
    }

    public async Task<Playlist> CreatePlaylistAsync(string playlistId, string username, string name,
        string? description, ImageProcessingResult? image)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var slug = await SlugRecords.ClaimAsync(_dynamoDbService, username, SlugKind.Playlist, playlistId, name);

        var item = new PlaylistDataModel
        {
            Pk = $"USER#{username}",
            Sk = $"PLAYLIST#{playlistId}",
            Gsi3Pk = $"PLAYLISTS#{username}",
            Gsi3Sk = $"DATE#{now}",
            Name = name,
            Description = description,
            Type = PlaylistType.Custom,
            Slug = slug,
            ImageUrl = image?.ImageUrl,
            ImageBgColor = image?.ImageHex,
            CreatedAt = now,
        };

        await _dynamoDbService.WriteToDynamoAsync(item);
        return ToPlaylist(item);
    }

    public async Task<Playlist?> UpdatePlaylistAsync(string username, string playlistId, string? name,
        string? description, ImageProcessingResult? image, bool clearImage, string? slug = null)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var builder = new UpdateExpressionBuilder();
        builder.AddNullableString("name", "n", name);
        builder.AddNullableString("description", "d", description);

        if (image is not null)
        {
            builder.AddValue("imageUrl", "iu", image.ImageUrl);
            builder.AddNullableString("imageBgColor", "ib", image.ImageHex);
        }
        else if (clearImage)
        {
            builder.RemoveField("imageUrl", "iu");
            builder.RemoveField("imageBgColor", "ib");
        }

        // A new URL: claim its slug record in the same transaction (the old record stays as a redirect)
        if (slug is not null)
            builder.AddValue("slug", "s", slug);

        if (!builder.IsEmpty)
        {
            var tx = _dynamoDbService.CreateTransactionPart<PlaylistDataModel>();
            tx.AddSaveItem($"USER#{username}", $"PLAYLIST#{normalisedId}", builder.Build());
            if (slug is null)
                await _dynamoDbService.ExecuteTransactWriteAsync(tx);
            else if (!await _dynamoDbService.TryExecuteTransactWriteAsync(tx,
                         SlugRecords.BuildClaim(_dynamoDbService, username, SlugKind.Playlist, normalisedId, slug)))
                throw new ArgumentException(SlugRecords.TakenMessage);
        }

        return await GetPlaylistAsync(username, normalisedId);
    }

    public async Task DeletePlaylistAsync(string username, string playlistId)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        // Memberships first, meta last — a mid-delete crash leaves the playlist visible and the delete retryable
        var memberships = await _dynamoDbService.QueryAsync<PlaylistTrackDataModel>(
            $"PLAYLIST#{normalisedId}",
            "TRACK#",
            QueryOperator.BeginsWith);

        if (memberships.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<PlaylistTrackDataModel>();
            foreach (var membership in memberships)
                membershipBatch.AddDeleteItem(membership);

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        await SlugRecords.DeleteForTargetAsync(_dynamoDbService, username, SlugKind.Playlist, normalisedId);

        var metaBatch = _dynamoDbService.CreateBatchWritePart<PlaylistDataModel>();
        metaBatch.AddDeleteKey($"USER#{username}", $"PLAYLIST#{normalisedId}");
        await _dynamoDbService.ExecuteBatchWriteAsync(metaBatch);
    }

    public async Task<bool> AddTrackAsync(string username, string playlistId, Track track)
    {
        var normalisedId = playlistId.ToLowerInvariant();
        var normalisedTrackId = track.Id.ToLowerInvariant();

        // Re-adding is a no-op. The read is a fast path; the attribute_not_exists guard makes
        // a concurrent double-add write the membership (and move the counters) only once.
        var existing = await _dynamoDbService.GetFromDynamoAsync<PlaylistTrackDataModel>(
            $"PLAYLIST#{normalisedId}", $"TRACK#{normalisedTrackId}");
        if (existing is not null)
            return false;

        var rank = await GetMaxRankAsync(normalisedId) + MembershipRank.Gap;
        var membershipTx = _dynamoDbService.CreateTransactionPart<PlaylistTrackDataModel>();
        _dynamoDbService.AddConditionalSave(membershipTx, new PlaylistTrackDataModel
        {
            Pk = $"PLAYLIST#{normalisedId}",
            Sk = $"TRACK#{normalisedTrackId}",
            Gsi1Pk = $"PLAYLIST#{normalisedId}",
            Gsi1Sk = MembershipRank.ToSortKey(rank),
            TrackOwnerUsername = track.Owner.Username,
            Duration = track.Duration,
            TrackName = track.TrackName,
            AddedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        }, ConditionExpressions.ItemNotExists());

        return await _dynamoDbService.TryExecuteTransactWriteAsync(membershipTx,
            CreatePlaylistCounterUpdate(username, normalisedId,
                ("trackCount", 1),
                ("totalDurationSeconds", track.Duration)));
    }

    // Highest existing rank in the playlist's GSI1 partition (0 when empty)
    private async Task<int> GetMaxRankAsync(string normalisedId)
    {
        var (last, _) = await _dynamoDbService.QueryPaginatedAsync<PlaylistTrackDataModel>(
            hashKey: $"PLAYLIST#{normalisedId}",
            rangeKey: "ORDER#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: 1,
            paginationToken: null,
            scanIndexForward: false
        );

        return last.Count == 0 ? 0 : MembershipRank.FromSortKey(last[0].Gsi1Sk!);
    }

    public async Task<bool> RemoveTrackAsync(string username, string playlistId, string trackId)
    {
        var normalisedId = playlistId.ToLowerInvariant();
        var normalisedTrackId = trackId.ToLowerInvariant();

        var existing = await _dynamoDbService.GetFromDynamoAsync<PlaylistTrackDataModel>(
            $"PLAYLIST#{normalisedId}", $"TRACK#{normalisedTrackId}");
        if (existing is null)
            return false;

        // Guarded so a concurrent double-remove decrements once
        var membershipTx = _dynamoDbService.CreateTransactionPart<PlaylistTrackDataModel>();
        membershipTx.AddDeleteKey($"PLAYLIST#{normalisedId}", $"TRACK#{normalisedTrackId}",
            ConditionExpressions.ItemExists());

        return await _dynamoDbService.TryExecuteTransactWriteAsync(membershipTx,
            CreatePlaylistCounterUpdate(username, normalisedId,
                ("trackCount", -1),
                ("totalDurationSeconds", -(long)existing.Duration)));
    }

    public async Task<int> SetTracksAsync(string username, string playlistId, IReadOnlyList<string> orderedTrackIds)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var memberships = await _dynamoDbService.QueryAsync<PlaylistTrackDataModel>(
            $"PLAYLIST#{normalisedId}", "TRACK#", QueryOperator.BeginsWith);
        var byId = memberships.ToDictionary(m => m.TrackId, StringComparer.OrdinalIgnoreCase);

        var unknown = orderedTrackIds.Where(id => !byId.ContainsKey(id)).ToList();
        if (unknown.Count > 0)
            throw new ArgumentException($"tracks not in the playlist: {string.Join(", ", unknown)}");

        var keep = orderedTrackIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var removed = memberships.Where(m => !keep.Contains(m.TrackId)).ToList();
        if (memberships.Count == 0)
            return 0;

        var batch = _dynamoDbService.CreateBatchWritePart<PlaylistTrackDataModel>();
        foreach (var membership in removed)
            batch.AddDeleteItem(membership);

        var rank = 0;
        foreach (var trackId in orderedTrackIds)
        {
            rank += MembershipRank.Gap;
            var membership = byId[trackId];
            membership.Gsi1Sk = MembershipRank.ToSortKey(rank);
            batch.AddPutItem(membership);
        }

        await _dynamoDbService.ExecuteBatchWriteAsync(batch);

        if (removed.Count > 0)
            await UpdatePlaylistCountersAsync(username, normalisedId,
                ("trackCount", -removed.Count),
                ("totalDurationSeconds", -removed.Sum(m => (long)m.Duration)));
        return removed.Count;
    }

    private Task UpdatePlaylistCountersAsync(string username, string normalisedId,
        params (string Attribute, long Delta)[] deltas) =>
        _dynamoDbService.ExecuteTransactWriteAsync(CreatePlaylistCounterUpdate(username, normalisedId, deltas));

    private ITransactWrite CreatePlaylistCounterUpdate(string username, string normalisedId,
        params (string Attribute, long Delta)[] deltas) =>
        _dynamoDbService.CounterUpdate<PlaylistDataModel>(Keys.Playlist(username, normalisedId), deltas);

    public async Task<PaginatedResult<PlaylistTrackEntry>> GetPlaylistTracksAsync(string playlistId,
        string viewerUsername, int pageSize, string? cursor)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var (memberships, nextToken) = await _dynamoDbService.QueryPaginatedAsync<PlaylistTrackDataModel>(
            hashKey: $"PLAYLIST#{normalisedId}",
            rangeKey: "ORDER#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: true
        );

        if (memberships.Count == 0)
            return new PaginatedResult<PlaylistTrackEntry> { Items = [], NextCursor = nextToken };

        var trackRefs = memberships
            .Select(m => (m.TrackId, m.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTrackSummariesAsync(_dynamoDbService, trackRefs, viewerUsername);

        // A missing track → DELETED placeholder (renders from denormalized name/duration).
        // Access-revoked entries are downgraded later, in the handler that knows the viewer.
        var entries = memberships
            .Select(m =>
            {
                var track = tracksById.GetValueOrDefault(m.TrackId);
                return new PlaylistTrackEntry
                {
                    TrackId = m.TrackId,
                    Name = track?.Name ?? m.TrackName ?? "Unavailable track",
                    Duration = track?.Duration ?? m.Duration,
                    AddedAt = m.AddedAt,
                    Unavailable = track is null,
                    Reason = track is null ? PlaylistTrackReason.Deleted : null,
                    Track = track,
                };
            })
            .ToList();

        return new PaginatedResult<PlaylistTrackEntry> { Items = entries, NextCursor = nextToken };
    }

    private static Playlist ToPlaylist(PlaylistDataModel item) => new()
    {
        Id = item.PlaylistId,
        Name = item.Name,
        Description = item.Description,
        Type = item.Type,
        Slug = item.Slug,
        ImageUrl = item.ImageUrl,
        ImageBgColor = item.ImageBgColor,
        TrackCount = item.TrackCount,
        TotalDurationSeconds = item.TotalDurationSeconds,
        CreatedAt = item.CreatedAt,
    };

    public static PlaylistDataModel BuildLikesPlaylistItem(string username, long now) => new()
    {
        Pk = $"USER#{username}",
        Sk = $"PLAYLIST#{LikesPlaylistId}",
        Gsi3Pk = $"PLAYLISTS#{username}",
        Gsi3Sk = LikesGsi3SortKey,
        Name = LikesPlaylistName,
        Type = PlaylistType.Likes,
        TrackCount = 0,
        TotalDurationSeconds = 0,
        CreatedAt = now,
    };
}
