using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class ActivityRepository : IActivityRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public ActivityRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<ActivityEntry>> GetActivityAsync(string username, int pageSize, string? cursor)
    {
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<ActivityItemDataModel>(
            hashKey: $"ACTIVITY#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (items.Count == 0)
            return new PaginatedResult<ActivityEntry> { Items = [], NextCursor = nextToken };

        // Target owner differs by type: a liked target is the viewer's own track/album;
        // every other activity's target is owned by the actor.
        string TargetOwner(ActivityItemDataModel a) =>
            a.Type is ActivityType.TrackLiked or ActivityType.AlbumLiked ? username : a.ActorUsername;

        // Liveness key: the exact SHARED#/LIKE# record that produced this activity. If it's gone
        // (unshared, unliked, removed, revoked), the activity is stale and must not show — this is
        // what makes GET /activity a live snapshot of current relationships rather than an event
        // log. NOT general access (e.g. album grants) — the direct record that caused this row.
        // The record must also be the *same* one: its likedAt/sharedAt has to equal the row's
        // createdAt, so after unlike→re-like or a re-share only the newest row shows instead of
        // the old ones reviving against the recreated key.
        // Follow has no liveness key: it's already eager-deleted on unfollow.
        (string pk, string sk)? RelKey(ActivityItemDataModel a) => a.Type switch
        {
            ActivityType.TrackShared => ($"TRACK#{a.TargetId}", $"SHARED#{username}"),
            ActivityType.AlbumShared => ($"ALBUM#{a.TargetId}", $"SHARED#{username}"),
            ActivityType.TrackLiked => ($"TRACK#{a.TargetId}", $"LIKE#{a.ActorUsername}"),
            ActivityType.AlbumLiked => ($"ALBUM#{a.TargetId}", $"LIKE#{a.ActorUsername}"),
            _ => null,
        };

        // Keys must be de-duplicated: a user can have several activities about the same
        // target (e.g. a track re-shared after an unshare, or re-liked), and BatchGetItem
        // rejects duplicate keys in one request.
        var actorKeys = items.Select(a => a.ActorUsername).Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var trackKeys = items.Where(a => a.TargetType == FeedItemType.Track)
            .Select(a => (pk: $"USER#{TargetOwner(a)}", sk: $"TRACK#{a.TargetId}"))
            .Distinct();
        var albumKeys = items.Where(a => a.TargetType == FeedItemType.Album)
            .Select(a => (pk: $"USER#{TargetOwner(a)}", sk: $"ALBUM#{a.TargetId}"))
            .Distinct();
        var relKeys = items.Select(RelKey).Where(k => k.HasValue).Select(k => k!.Value).Distinct();

        var actorsTask = _dynamoDbService.BatchGetAsync<UserDataModel>(actorKeys);
        var tracksTask = _dynamoDbService.BatchGetAsync<TrackDataModel>(trackKeys);
        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(albumKeys);
        var liveTask = _dynamoDbService.BatchGetAsync<KeyProbeDataModel>(relKeys);
        await Task.WhenAll(actorsTask, tracksTask, albumsTask, liveTask);

        var actors = actorsTask.Result.ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);
        var trackNames = tracksTask.Result.ToDictionary(t => t.TrackId, t => t.TrackName, StringComparer.OrdinalIgnoreCase);
        var albumNames = albumsTask.Result.ToDictionary(a => a.AlbumId, a => a.Name, StringComparer.OrdinalIgnoreCase);
        var liveRelAt = liveTask.Result.ToDictionary(p => (p.Pk, p.Sk), p => p.LikedAt ?? p.SharedAt);

        string? TargetName(ActivityItemDataModel a) => a.TargetType == FeedItemType.Track
            ? trackNames.GetValueOrDefault(a.TargetId)
            : albumNames.GetValueOrDefault(a.TargetId);

        // Keep a row only if: the actor resolves, and — for share/like — its underlying
        // relationship record still exists with a matching timestamp (liveness) and its target
        // still resolves.
        // Follow rows skip target/liveness (USER target, no name; eager-deleted on unfollow).
        bool Keep(ActivityItemDataModel a)
        {
            if (!actors.ContainsKey(a.ActorUsername))
                return false;
            if (a.Type == ActivityType.UserFollowed)
                return true;
            if (TargetName(a) is null)
                return false;
            var rk = RelKey(a);
            return rk is null
                || (liveRelAt.TryGetValue((rk.Value.pk, rk.Value.sk), out var at) && at == a.CreatedAt);
        }

        var entries = items
            .Where(Keep)
            .Select(a => new ActivityEntry
            {
                Type = a.Type,
                Actor = UserSummary.From(actors[a.ActorUsername]),
                TargetType = a.TargetType,
                TargetId = a.TargetId,
                TargetName = TargetName(a),
                CreatedAt = a.CreatedAt,
            })
            .ToList();

        return new PaginatedResult<ActivityEntry> { Items = entries, NextCursor = nextToken };
    }

    public Task MarkActivitySeenAsync(string username)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var tx = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        tx.AddSaveItem(
            $"USER#{username}", "PROFILE",
            new Expression
            {
                ExpressionStatement = "SET #a = :v",
                ExpressionAttributeNames = new Dictionary<string, string> { { "#a", "activitySeenAt" } },
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":v", now } },
            });
        return _dynamoDbService.ExecuteTransactWriteAsync(tx);
    }
}
