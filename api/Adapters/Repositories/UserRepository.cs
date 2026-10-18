using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class UserRepository : IUserRepository
{
    public const string SearchIndexPk = "USERS";
    public static string SearchIndexSk(string username) => $"USERNAME#{username.ToLowerInvariant()}";

    private readonly IDynamoDBService _dynamoDbService;

    public UserRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<User?> GetUserByUsername(string username)
    {
        var userDataModel = await _dynamoDbService.GetFromDynamoAsync<UserDataModel>($"USER#{username}", "PROFILE");
        return userDataModel;
    }

    public async Task<User?> UpdateUser(User user, bool clearImage)
    {
        var builder = new UpdateExpressionBuilder();

        builder.AddNullableString("displayName", "dn", user.DisplayName);
        builder.AddNullableString("firstName", "fn", user.FirstName);
        builder.AddNullableString("lastName", "ln", user.LastName);
        builder.AddNullableString("country", "ctr", user.Country);
        builder.AddNullableString("city", "ct", user.City);
        builder.AddNullableString("bio", "bio", user.Bio);

        HandleImageUpdate(builder, user, clearImage);

        builder.AddValue("followersPrivate", "fp", user.FollowersPrivate);
        builder.AddValue("followingsPrivate", "fip", user.FollowingsPrivate);

        if (user.IncomingShares is not null)
            builder.AddValue("incomingShares", "ish", user.IncomingShares);

        if (builder.IsEmpty)
            return await GetUserByUsername(user.Username);

        var updateTransaction = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        updateTransaction.AddSaveItem($"USER#{user.Username}", "PROFILE", builder.Build());

        await _dynamoDbService.ExecuteTransactWriteAsync(updateTransaction);
        return await GetUserByUsername(user.Username);
    }

    public async Task<(long? LastSeenAt, long? ActivitySeenAt)> GetSeenMarkersAsync(string username)
    {
        var markers = await _dynamoDbService.GetFromDynamoAsync<SeenMarkersDataModel>($"USER#{username}", "PROFILE");
        return (markers?.LastSeenAt, markers?.ActivitySeenAt);
    }

    public Task MarkSeenAsync(string username)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var tx = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        tx.AddSaveItem(
            $"USER#{username}", "PROFILE",
            new Expression
            {
                ExpressionStatement = "SET #a = :v",
                ExpressionAttributeNames = new Dictionary<string, string> { { "#a", "lastSeenAt" } },
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":v", now } },
            });
        return _dynamoDbService.ExecuteTransactWriteAsync(tx);
    }

    private void HandleImageUpdate(UpdateExpressionBuilder builder, User user, bool clearImage)
    {
        if (clearImage)
        {
            builder.RemoveField("imageUrl", "img");
            builder.RemoveField("imageBgColor", "ibc");

            return;
        }

        if (!string.IsNullOrWhiteSpace(user.ImageUrl))
            builder.AddNullableString("imageUrl", "img", user.ImageUrl);
        if (!string.IsNullOrWhiteSpace(user.ImageBgColor))
            builder.AddNullableString("imageBgColor", "ibc", user.ImageBgColor);
    }

    public async Task FollowUser(string usernameToFollow, string followerUsername)
    {
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

        var parts = new List<ITransactWrite>
        {
            followTx,
            CreateCounterUpdate(usernameToFollow, "followerCount", 1),
            CreateCounterUpdate(followerUsername, "followingCount", 1),
        };

        // Notify the followed user (recipient-perspective activity), skipping self-follows
        // (mirrors the like feed's no-self-echo). The activity SK is deterministic on the
        // follow timestamp so unfollow can delete it — see ActivityItems.BuildFollow.
        if (!string.Equals(followerUsername, usernameToFollow, StringComparison.OrdinalIgnoreCase))
        {
            var activityTx = _dynamoDbService.CreateTransactionPart<ActivityItemDataModel>();
            activityTx.AddSaveItem(ActivityItems.BuildFollow(usernameToFollow, followerUsername, timestamp));
            parts.Add(activityTx);
        }

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }

    private Task<UserFollowDataModel?> GetFollowRecordAsync(string followedUsername, string followerUsername) =>
        _dynamoDbService.GetFromDynamoAsync<UserFollowDataModel>(
            $"FOLLOW#{followedUsername}", $"USER#{followerUsername}");

    private ITransactWrite CreateCounterUpdate(string username, string attribute, int value)
    {
        var tx = _dynamoDbService.CreateTransactionPart<UserDataModel>();

        tx.AddSaveItem(
            $"USER#{username}",
            "PROFILE",
            new Expression()
            {
                ExpressionStatement = $"ADD {attribute} :val",
                ExpressionAttributeNames = null,
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":val", value } }
            }
        );

        return tx;
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
        // the follow record's CreatedAt; older records without it (or self-follows, which never
        // wrote one) simply skip — a keyed delete of a missing item would be a harmless no-op anyway.
        if (existingRecord.CreatedAt is { } followTimestamp
            && !string.Equals(followerUsername, usernameToUnfollow, StringComparison.OrdinalIgnoreCase))
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

    public async Task<PaginatedResult<UserSummary>> SearchUsersAsync(string prefix, int pageSize, string? cursor)
    {
        // GSI3 projects ALL, so matches come back as full profiles — no hydration step.
        var (profiles, nextToken) = await _dynamoDbService.QueryPaginatedAsync<UserDataModel>(
            hashKey: SearchIndexPk,
            rangeKey: SearchIndexSk(prefix),
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: true
        );

        return new PaginatedResult<UserSummary>
        {
            Items = profiles.Select(UserSummary.From).ToList(),
            NextCursor = nextToken,
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
            Items = await GetProfilesInOrderAsync(followers),
            NextCursor = nextToken,
        };
    }

    // BatchGet returns profiles in arbitrary order and rejects duplicate keys, so dedupe the
    // usernames, then re-apply the page's order (dropping any profile that no longer exists)
    private async Task<List<UserSummary>> GetProfilesInOrderAsync(List<string> usernames)
    {
        if (usernames.Count == 0)
            return [];

        var keys = usernames
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var profiles = (await _dynamoDbService.BatchGetAsync<UserDataModel>(keys))
            .ToDictionary(p => p.Username, StringComparer.OrdinalIgnoreCase);

        return usernames
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(profiles.ContainsKey)
            .Select(u => UserSummary.From(profiles[u]))
            .ToList();
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
            Items = await GetProfilesInOrderAsync(followings),
            NextCursor = nextToken,
        };
    }

    public async Task<List<string>> GetValidatedRecipientsAsync(List<string> usernames, string senderUsername)
    {
        var distinct = usernames
            .Where(u => !string.IsNullOrWhiteSpace(u) && !string.Equals(u, senderUsername, StringComparison.OrdinalIgnoreCase)) //remove senders's username
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (distinct.Count == 0)
            return [];

        var keys = distinct.Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var foundUsers = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);

        var allowed = new List<string>();
        var followChecks = new List<(string Username, Task<UserFollow> Status)>();

        foreach (var user in foundUsers)
        {
            switch (user.IncomingShares)
            {
                case IncomingSharesSetting.None:
                    break;
                case IncomingSharesSetting.Following:
                    followChecks.Add((user.Username, GetFollowStatus(senderUsername, user.Username)));
                    break;
                default: // everyone
                    allowed.Add(user.Username);
                    break;
            }
        }

        await Task.WhenAll(followChecks.Select(c => c.Status));
        allowed.AddRange(
            followChecks
                .Where(c => c.Status.Result.FollowStatus)
                .Select(c => c.Username)
            );

        return allowed;
    }
}
