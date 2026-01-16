using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports;

namespace Adapters;

public class UserRepository : IUserRepository
{
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

        if (builder.IsEmpty)
            return await GetUserByUsername(user.Username);

        var updateTransaction = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        updateTransaction.AddSaveItem($"USER#{user.Username}", "PROFILE", builder.Build());

        await _dynamoDbService.ExecuteTransactWriteAsync(updateTransaction);
        return await GetUserByUsername(user.Username);
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
        var followRecord = new UserFollowDataModel
        {
            Pk = $"FOLLOW#{usernameToFollow}",
            Sk = $"USER#{followerUsername}",
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Gsi1Pk = $"FOLLOWING#{followerUsername}",
            Gsi1Sk = $"FOLLOWING#{followerUsername}"
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
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":val", value } }
            }
        );

        return tx;
    }

    public async Task UnfollowUser(string usernameToUnfollow, string followerUsername)
    {
        var followRecordToDelete = new UserFollowDataModel
        {
            Pk = $"FOLLOW#{usernameToUnfollow}",
            Sk = $"USER#{followerUsername}",
            CreatedAt = 0,
            Gsi1Pk = "",
            Gsi1Sk = ""
        };

        var followTx = _dynamoDbService.CreateTransactionPart<UserFollowDataModel>();
        followTx.AddDeleteItem(followRecordToDelete);

        var userProfileTx = CreateCounterUpdate(usernameToUnfollow, "followerCount", -1);
        var followerProfileTx = CreateCounterUpdate(followerUsername, "followingCount", -1);

        await _dynamoDbService.ExecuteTransactWriteAsync(followTx, userProfileTx, followerProfileTx);
    }

    public async Task<UserFollow> GetFollowStatus(string username, string followerUsername)
    {
        var userFollowDataModel =
            await _dynamoDbService.GetFromDynamoAsync<UserFollowDataModel>($"FOLLOW#{username}",
                $"USER#{followerUsername}");

        return new UserFollow()
        {
            FollowStatus = userFollowDataModel != null,
            CreatedAt = userFollowDataModel?.CreatedAt,
        };
    }

    public async Task<List<User>> GetUserFollowers(string username)
    {
        var userFollows = await _dynamoDbService.QueryAsync<UserFollowDataModel>($"FOLLOW#{username}");

        if (userFollows.Count == 0) return [];

        var keys = userFollows.Select(f => (f.Sk, "PROFILE"));

        var followerProfiles = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);
        return followerProfiles.ToList<User>();
    }

    public async Task<List<User>> GetUserFollowings(string username)
    {
        var userFollowing = await _dynamoDbService.QueryAsync<UserFollowDataModel>(
            hashKey: $"FOLLOWING#{username}",
            rangeKey: $"FOLLOWING#{username}",
            queryOperator: QueryOperator.Equal,
            indexName: "GSI1"
        );

        if (userFollowing.Count == 0) return [];

        var keys = userFollowing.Select(f => ($"USER#{f.Pk.Replace("FOLLOW#", "")}", "PROFILE"));

        var profiles = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);
        return profiles.ToList<User>();
    }
}