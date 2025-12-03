using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Amazon.Lambda.Serialization.SystemTextJson;
using Domain;

// Assembly attribute to enable Lambda logging
[assembly: LambdaSerializer(typeof(DefaultLambdaJsonSerializer))]

namespace PostConfirmationLambda;

public class Function
{
    private readonly DynamoDBContext _dbContext;

    public Function()
    {
        IAmazonDynamoDB CreateClient()
        {
            return new AmazonDynamoDBClient();
        }

        _dbContext = new DynamoDBContextBuilder()
            .WithDynamoDBClient(CreateClient)
            .Build();
    }

    public async Task<CognitoPostConfirmationEvent> FunctionHandler(CognitoPostConfirmationEvent cognitoEvent,
        ILambdaContext context)
    {
        if (cognitoEvent.TriggerSource != "PostConfirmation_ConfirmSignUp")
            return cognitoEvent;

        var userSub = cognitoEvent.Request.UserAttributes.GetValueOrDefault("sub", "");
        var userName = cognitoEvent.UserName;

        var userData = UserDataModel.CreateFromCognitoSignUp(userName, userSub);

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