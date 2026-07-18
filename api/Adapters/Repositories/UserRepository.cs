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
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var followRecord = new UserFollowDataModel
        {
            Pk = $"FOLLOW#{usernameToFollow}",
            Sk = $"USER#{followerUsername}#{timestamp}",
            CreatedAt = timestamp,
            Gsi1Pk = $"FOLLOWING#{followerUsername}",
            Gsi1Sk = $"DATE#{timestamp}#TARGET#{usernameToFollow}"
        };

        var followTx = _dynamoDbService.CreateTransactionPart<UserFollowDataModel>();
        followTx.AddSaveItem(followRecord);

        var userProfileTx = CreateCounterUpdate(usernameToFollow, "followerCount", 1);
        var followerProfileTx = CreateCounterUpdate(followerUsername, "followingCount", 1);

        await _dynamoDbService.ExecuteTransactWriteAsync(followTx, userProfileTx, followerProfileTx);
    }

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
        // Query to find the exact record (SK includes timestamp, unknown at unfollow time)
        var existingRecords = await _dynamoDbService.QueryAsync<UserFollowDataModel>(
            hashKey: $"FOLLOW#{usernameToUnfollow}",
            rangeKey: $"USER#{followerUsername}#",
            queryOperator: QueryOperator.BeginsWith
        );

        var existingRecord = existingRecords.FirstOrDefault();
        if (existingRecord is null) return;

        var followTx = _dynamoDbService.CreateTransactionPart<UserFollowDataModel>();
        followTx.AddDeleteItem(existingRecord);

        var userProfileTx = CreateCounterUpdate(usernameToUnfollow, "followerCount", -1);
        var followerProfileTx = CreateCounterUpdate(followerUsername, "followingCount", -1);

        await _dynamoDbService.ExecuteTransactWriteAsync(followTx, userProfileTx, followerProfileTx);
    }

    public async Task<UserFollow> GetFollowStatus(string username, string followerUsername)
    {
        var records = await _dynamoDbService.QueryAsync<UserFollowDataModel>(
            hashKey: $"FOLLOW#{username}",
            rangeKey: $"USER#{followerUsername}#",
            queryOperator: QueryOperator.BeginsWith
        );

        var userFollowDataModel = records.FirstOrDefault();

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
        var (followRecords, nextToken) = await _dynamoDbService.QueryPaginatedAsync<UserFollowDataModel>(
            hashKey: $"FOLLOW#{username}",
            rangeKey: "USER#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (followRecords.Count == 0)
            return new PaginatedResult<UserSummary> { Items = [], NextCursor = null };

        // SK format: USER#{followerUsername}#{timestamp} — extract username at index 1
        var keys = followRecords.Select(f => ($"USER#{f.Sk.Split('#')[1]}", "PROFILE"));
        var profiles = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);

        return new PaginatedResult<UserSummary>
        {
            Items = profiles.Select(UserSummary.From).ToList(),
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

        if (followingRecords.Count == 0)
            return new PaginatedResult<UserSummary> { Items = [], NextCursor = null };

        // GSI1SK format: DATE#{timestamp}#TARGET#{usernameToFollow}
        var keys = followingRecords.Select(f => ($"USER#{f.Gsi1Sk!.Split("#TARGET#")[1]}", "PROFILE"));
        var profiles = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);

        return new PaginatedResult<UserSummary>
        {
            Items = profiles.Select(UserSummary.From).ToList(),
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
