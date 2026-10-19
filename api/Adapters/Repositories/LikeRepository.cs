using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class LikeRepository : ILikeRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public LikeRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task LikeTrackAsync(string trackId, string username, string trackOwnerUsername, int duration)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        // Liking twice must not double-increment likeCount. The read is a fast path; the
        // attribute_not_exists guard is what makes it safe against a concurrent double-like.
        var existing = await GetLikeAsync(normalisedTrackId, username);
        if (existing is not null)
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var likeTx = _dynamoDbService.CreateTransactionPart<LikeDataModel>();
        _dynamoDbService.AddConditionalSave(likeTx, new LikeDataModel
        {
            Pk = $"TRACK#{normalisedTrackId}",
            Sk = $"LIKE#{username}",
            Gsi1Pk = $"LIKES#{username}",
            Gsi1Sk = $"DATE#{now}",
            TrackOwnerUsername = trackOwnerUsername,
            Duration = duration,
            LikedAt = now,
        }, ConditionExpressions.ItemNotExists());

        var parts = new List<ITransactWrite>
        {
            likeTx,
            LikeCountUpdate(normalisedTrackId, trackOwnerUsername, 1),
            LikesPlaylistUpdate(username, 1, duration),
        };

        // Notify the track owner — but never echo a self-like
        if (!string.Equals(username, trackOwnerUsername, StringComparison.OrdinalIgnoreCase))
        {
            var activityTx = _dynamoDbService.CreateTransactionPart<ActivityItemDataModel>();
            activityTx.AddSaveItem(ActivityItems.Build(trackOwnerUsername, ActivityType.TrackLiked, username,
                FeedItemType.Track, normalisedTrackId, now));
            parts.Add(activityTx);
        }

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }

    public async Task UnlikeTrackAsync(string trackId, string username, string trackOwnerUsername)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var existing = await GetLikeAsync(normalisedTrackId, username);
        if (existing is null)
            return;

        var likeTx = _dynamoDbService.CreateTransactionPart<LikeDataModel>();
        likeTx.AddDeleteKey(existing.Pk, existing.Sk, ConditionExpressions.ItemExists());

        await _dynamoDbService.TryExecuteTransactWriteAsync(likeTx,
            LikeCountUpdate(normalisedTrackId, trackOwnerUsername, -1),
            LikesPlaylistUpdate(username, -1, -(long)existing.Duration));
    }

    public async Task DeleteLikesForTrackAsync(string trackId)
    {
        var likes = await _dynamoDbService.QueryAsync<LikeDataModel>(
            $"TRACK#{trackId.ToLowerInvariant()}", "LIKE#", QueryOperator.BeginsWith);

        // Each like goes together with its liker's likes-playlist decrement (the like record holds
        // the only denormalized duration, so it's now or never). Guarded on the like still existing,
        // so a retried delete or a concurrent unlike never decrements twice. The track's own
        // likeCount isn't touched — the track is being deleted.
        await Parallel.ForEachAsync(likes, new ParallelOptions { MaxDegreeOfParallelism = 10 },
            async (like, _) =>
            {
                var likeTx = _dynamoDbService.CreateTransactionPart<LikeDataModel>();
                likeTx.AddDeleteKey(like.Pk, like.Sk, ConditionExpressions.ItemExists());

                await _dynamoDbService.TryExecuteTransactWriteAsync(likeTx,
                    LikesPlaylistUpdate(like.LikerUsername, -1, -(long)like.Duration));
            });
    }

    public async Task<bool> IsTrackLikedByUserAsync(string trackId, string username)
    {
        return await GetLikeAsync(trackId.ToLowerInvariant(), username) is not null;
    }

    public async Task<PaginatedResult<LikedTrack>> GetLikedTracksAsync(string username, int pageSize, string? cursor)
    {
        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<LikeDataModel>(
            hashKey: $"LIKES#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<LikedTrack> { Items = [], NextCursor = null };

        var trackRefs = likes
            .Select(l => (l.TrackId, l.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTrackSummariesAsync(
            _dynamoDbService, trackRefs, username, allLiked: true);

        var tracks = likes
            .Select(l => tracksById.GetValueOrDefault(l.TrackId) is { } track ? new LikedTrack(track, l.LikedAt) : null)
            .OfType<LikedTrack>()
            .ToList();

        return new PaginatedResult<LikedTrack> { Items = tracks, NextCursor = nextToken };
    }

    public async Task<PaginatedResult<TrackLiker>> GetTrackLikersAsync(string trackId, int pageSize, string? cursor)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<LikeDataModel>(
            hashKey: $"TRACK#{normalisedTrackId}",
            rangeKey: "LIKE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<TrackLiker> { Items = [], NextCursor = null };

        var profiles = await ProfileLookup.GetAsync(_dynamoDbService, likes.Select(l => l.LikerUsername));

        var likers = likes
            .Where(l => profiles.ContainsKey(l.LikerUsername))
            .Select(l => new TrackLiker { User = UserSummary.From(profiles[l.LikerUsername]), LikedAt = l.LikedAt })
            .ToList();

        return new PaginatedResult<TrackLiker> { Items = likers, NextCursor = nextToken };
    }

    private Task<LikeDataModel?> GetLikeAsync(string normalisedTrackId, string username)
    {
        return _dynamoDbService.GetFromDynamoAsync<LikeDataModel>(
            $"TRACK#{normalisedTrackId}", $"LIKE#{username}");
    }

    private ITransactWrite LikeCountUpdate(string normalisedTrackId, string trackOwnerUsername, int delta) =>
        _dynamoDbService.CounterUpdate<TrackDataModel>(Keys.Track(trackOwnerUsername, normalisedTrackId),
            ("likeCount", delta));

    // The liker's built-in likes playlist mirrors their likes: one track + its duration per like
    private ITransactWrite LikesPlaylistUpdate(string username, int trackDelta, long durationDelta) =>
        _dynamoDbService.CounterUpdate<PlaylistDataModel>(Keys.LikesPlaylist(username),
            ("trackCount", trackDelta), ("totalDurationSeconds", durationDelta));
}
