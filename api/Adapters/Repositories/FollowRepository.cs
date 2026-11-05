using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

// The follow graph: one deterministic row per (followed × follower) — FOLLOW#{followed} /
// USER#{follower} — projected into GSI1 (a user's followings) and GSI3 (a user's followers),
// both newest-first. Follower/following counts live on the two profiles.
public sealed class FollowRepository : IFollowRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public FollowRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }


    public async Task FollowUser(string usernameToFollow, string followerUsername)
    {
        // Self-follow is rejected outright: both counters live on the same profile item, and a
        // transaction can't touch one item twice (DynamoDB would refuse it)
        if (string.Equals(followerUsername, usernameToFollow, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("You can't follow yourself.");

        // Following twice must not double-count both profiles or emit a second activity item.
        // The read is a fast path; the attribute_not_exists guard on the (deterministic) follow
        // key cancels a concurrent double-follow's whole transaction.
        if (await GetFollowRecordAsync(usernameToFollow, followerUsername) is not null) return;

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var followTx = _dynamoDbService.CreateTransactionPart<UserFollowDataModel>();
        _dynamoDbService.AddConditionalSave(followTx, new UserFollowDataModel
        {
            Pk = $"FOLLOW#{usernameToFollow}",
            Sk = $"USER#{followerUsername}",
            CreatedAt = timestamp,
            Gsi1Pk = $"FOLLOWING#{followerUsername}",
            Gsi1Sk = $"DATE#{timestamp}#TARGET#{usernameToFollow}",
            Gsi3Pk = $"FOLLOWERS#{usernameToFollow}",
            Gsi3Sk = $"DATE#{timestamp}#USER#{followerUsername}",
        }, ConditionExpressions.ItemNotExists());

        // Notify the followed user (recipient-perspective activity). The activity SK is
        // deterministic on the follow timestamp so unfollow can delete it — see ActivityItems.BuildFollow.
        var activityTx = _dynamoDbService.CreateTransactionPart<ActivityItemDataModel>();
        activityTx.AddSaveItem(ActivityItems.BuildFollow(usernameToFollow, followerUsername, timestamp));

        await _dynamoDbService.TryExecuteTransactWriteAsync(followTx,
            CreateCounterUpdate(usernameToFollow, "followerCount", 1),
            CreateCounterUpdate(followerUsername, "followingCount", 1),
            activityTx);
    }


    public async Task UnfollowUser(string usernameToUnfollow, string followerUsername)
    {
        // The read supplies CreatedAt (for the activity key); the guard makes a concurrent
        // double-unfollow decrement once
        var existingRecord = await GetFollowRecordAsync(usernameToUnfollow, followerUsername);
        if (existingRecord is null) return;

        var followTx = _dynamoDbService.CreateTransactionPart<UserFollowDataModel>();
        followTx.AddDeleteKey(existingRecord.Pk, existingRecord.Sk, ConditionExpressions.ItemExists());

        var parts = new List<ITransactWrite>
        {
            followTx,
            CreateCounterUpdate(usernameToUnfollow, "followerCount", -1),
            CreateCounterUpdate(followerUsername, "followingCount", -1),
        };

        // Remove the follow activity written at FollowUser time. The SK is reconstructed from
        // the follow record's CreatedAt; older records without it simply skip. (No self-follow
        // record can exist — FollowUser rejects it — so an unfollow of yourself returns above.)
        if (existingRecord.CreatedAt is { } followTimestamp)
        {
            var activityTx = _dynamoDbService.CreateTransactionPart<ActivityItemDataModel>();
            activityTx.AddDeleteKey($"ACTIVITY#{usernameToUnfollow}",
                ActivityItems.FollowSk(followerUsername, followTimestamp));
            parts.Add(activityTx);
        }

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }


    public async Task<UserFollow> GetFollowStatus(string username, string followerUsername)
    {
        var userFollowDataModel = await GetFollowRecordAsync(username, followerUsername);

        return new UserFollow
        {
            FollowStatus = userFollowDataModel != null,
            CreatedAt = userFollowDataModel?.CreatedAt,
        };
    }


    public async Task<PaginatedResult<UserSummary>> GetUserFollowers(string username, int pageSize, string? cursor)
    {
        // GSI3 gives the followers newest-first: FOLLOWERS#{username} / DATE#{ts}#USER#{follower}
        var (followRecords, nextToken) = await _dynamoDbService.QueryPaginatedAsync<UserFollowDataModel>(
            hashKey: $"FOLLOWERS#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        var followers = followRecords.Select(f => f.Sk.Replace("USER#", "")).ToList();
        return new PaginatedResult<UserSummary>
        {
            Items = await ProfileLookup.GetSummariesInOrderAsync(_dynamoDbService, followers),
            NextCursor = nextToken,
        };
    }


    public async Task<PaginatedResult<UserSummary>> GetUserFollowings(string username, int pageSize, string? cursor)
    {
        var (followingRecords, nextToken) = await _dynamoDbService.QueryPaginatedAsync<UserFollowDataModel>(
            hashKey: $"FOLLOWING#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        // GSI1SK format: DATE#{timestamp}#TARGET#{usernameToFollow}
        var followings = followingRecords.Select(f => f.Gsi1Sk!.Split("#TARGET#")[1]).ToList();
        return new PaginatedResult<UserSummary>
        {
            Items = await ProfileLookup.GetSummariesInOrderAsync(_dynamoDbService, followings),
            NextCursor = nextToken,
        };
    }

    private Task<UserFollowDataModel?> GetFollowRecordAsync(string followedUsername, string followerUsername) =>
        FollowRecords.GetAsync(_dynamoDbService, followedUsername, followerUsername);

    private ITransactWrite CreateCounterUpdate(string username, string attribute, int value) =>
        _dynamoDbService.CounterUpdate<UserDataModel>(Keys.Profile(username), (attribute, value));
}
