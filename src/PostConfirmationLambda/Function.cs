using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.Lambda.Core;
using Amazon.Lambda.CognitoEvents;
using Domain;

// Assembly attribute to enable Lambda logging
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace PostConfirmationLambda
{
    public class Function
    {
        private readonly DynamoDBContext _dbContext;

        public Function()
        {
            IAmazonDynamoDB CreateClient() => new AmazonDynamoDBClient();

            _dbContext = new DynamoDBContextBuilder()
                .WithDynamoDBClient(CreateClient) 
                .Build();
        }

        public async Task<CognitoPostConfirmationEvent> FunctionHandler(CognitoPostConfirmationEvent cognitoEvent, ILambdaContext context)
        {
            if (cognitoEvent.TriggerSource != "PostConfirmation_ConfirmSignUp")
                return cognitoEvent;

            var userSub = cognitoEvent.Request.UserAttributes.GetValueOrDefault("sub", "");
            var userName = cognitoEvent.UserName;

            var userData = new UserDataModel
            {
                PK = $"USER#{userName}",
                SK = "info",
                Username = userName,
                DisplayName = userName,
                Bio = "Hey! I'm using MeloMelo!",
                Country = "Ireland",
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                FollowingsPrivate = false,
                FollowersPrivate = false,
                GSI1PK = $"USERSUB#{userSub}",
                FollowingCount = 0,
                FollowerCount = 0
            };

            try
            {
                var operationConfig = new DynamoDBOperationConfig
                {
                    OverrideTableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                };

                await _dbContext.SaveAsync(userData, operationConfig);

                context.Logger.LogLine($"User {userData.Username} successfully inserted into DynamoDB.");
            }
            catch (Exception ex)
            {
                context.Logger.LogError($"Error inserting user {userData.Username}: {ex}");
                throw;
            }

            return cognitoEvent;
        }
    }
}
