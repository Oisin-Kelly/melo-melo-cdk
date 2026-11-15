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

        // Keys must be de-duplicated: a user can have several activities about the same
        // target (e.g. a track re-shared after an unshare, or re-liked), and BatchGetItem
        // rejects duplicate keys in one request.
        var trackKeys = items.Where(a => a.TargetType == FeedItemType.Track)
            .Select(a => (pk: $"USER#{TargetOwner(a)}", sk: $"TRACK#{a.TargetId}"))
            .Distinct();
        var albumKeys = items.Where(a => a.TargetType == FeedItemType.Album)
            .Select(a => (pk: $"USER#{TargetOwner(a)}", sk: $"ALBUM#{a.TargetId}"))
            .Distinct();

        var actorsTask = ProfileLookup.GetAsync(_dynamoDbService, items.Select(a => a.ActorUsername));
        var tracksTask = _dynamoDbService.BatchGetAsync<TrackDataModel>(trackKeys);
        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(albumKeys);
        await Task.WhenAll(actorsTask, tracksTask, albumsTask);

        var actors = actorsTask.Result;
        var trackTargets = tracksTask.Result.ToDictionary(t => t.TrackId, t => (Name: t.TrackName, t.Slug),
            StringComparer.OrdinalIgnoreCase);
        var albumTargets = albumsTask.Result.ToDictionary(a => a.AlbumId, a => (a.Name, a.Slug),
            StringComparer.OrdinalIgnoreCase);

        (string Name, string? Slug)? Target(ActivityItemDataModel a) =>
            (a.TargetType == FeedItemType.Track ? trackTargets : albumTargets)
            .TryGetValue(a.TargetId, out var t) ? t : null;

        string? TargetName(ActivityItemDataModel a) => Target(a)?.Name;

        // Rows only exist while the like/share/follow behind them does: the stream consumer
        // (Adapters/Events/ActivityEvents) writes and deletes them with it. So a row is kept
        // unless its actor or (for likes/shares) its target has since gone. Follow rows have
        // a USER target with no name to resolve.
        bool Keep(ActivityItemDataModel a) =>
            actors.ContainsKey(a.ActorUsername) && (a.Type == ActivityType.UserFollowed || TargetName(a) is not null);

        var entries = items
            .Where(Keep)
            .Select(a => new ActivityEntry
            {
                Type = a.Type,
                Actor = UserSummary.From(actors[a.ActorUsername]),
                TargetType = a.TargetType,
                TargetId = a.TargetId,
                TargetName = TargetName(a),
                TargetOwner = a.Type == ActivityType.UserFollowed ? null : TargetOwner(a),
                TargetSlug = Target(a)?.Slug,
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
