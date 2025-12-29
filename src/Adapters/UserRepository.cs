using Amazon.DynamoDBv2.Model;
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

    public async Task FollowUser(string usernameToFollow, string followerUsername)
    {
        var transactionItems = GetBaseFollowTransactionItems(usernameToFollow, followerUsername, true);

        transactionItems.Add(new TransactWriteItem()
        {
            Put = new Put()
            {
                Item = new Dictionary<string, AttributeValue>
                {
                    ["PK"] = new() { S = $"FOLLOW#{usernameToFollow}" },
                    ["SK"] = new() { S = $"USER#{followerUsername}" },
                    ["createdAt"] = new() { N = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString() },
                    ["GSI1PK"] = new() { S = $"FOLLOWING#{followerUsername}" },
                    ["GSI1SK"] = new() { S = $"FOLLOWING#{followerUsername}" }
                },
                ConditionExpression = "attribute_not_exists(PK)"
            }
        });

        await _dynamoDbService.ExecuteTransactWriteAsync(transactionItems);
    }

    public async Task UnfollowUser(string usernameToUnfollow, string followerUsername)
    {
        var transactionItems = GetBaseFollowTransactionItems(usernameToUnfollow, followerUsername, false);

        transactionItems.Add(new TransactWriteItem()
        {
            Delete = new Delete
            {
                Key = new Dictionary<string, AttributeValue>
                {
                    ["PK"] = new() { S = $"FOLLOW#{usernameToUnfollow}" },
                    ["SK"] = new() { S = $"USER#{followerUsername}" }
                },
                ConditionExpression = "attribute_exists(PK)"
            }
        });

        await _dynamoDbService.ExecuteTransactWriteAsync(transactionItems);
    }

    private static List<TransactWriteItem> GetBaseFollowTransactionItems(string username, string requestorUsername, bool following)
    {
        var transactionItems = new List<TransactWriteItem>
        {
            new TransactWriteItem()
            {
                Update = new Update()
                {
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new() { S = $"USER#{username}" },
                        ["SK"] = new() { S = "PROFILE" }
                    },
                    UpdateExpression = "ADD followerCount :val",
                    ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    {
                        [":val"] = new() { N = following ? "1" : "-1" }
                    }
                }
            },

            new TransactWriteItem()
            {
                Update = new Update()
                {
                    Key = new Dictionary<string, AttributeValue>
                    {
                        ["PK"] = new() { S = $"USER#{requestorUsername}" },
                        ["SK"] = new() { S = "PROFILE" }
                    },
                    UpdateExpression = "ADD followingCount :val",
                    ExpressionAttributeValues = new Dictionary<string, AttributeValue>
                    {
                        [":val"] = new() { N = following ? "1" : "-1" }
                    }
                }
            }
        };

        return transactionItems;
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
}