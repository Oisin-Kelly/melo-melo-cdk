using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Amazon.Lambda.Serialization.SystemTextJson;
using Domain;
using Microsoft.Extensions.DependencyInjection;
using Ports;

// Assembly attribute to enable Lambda logging
[assembly: LambdaSerializer(typeof(DefaultLambdaJsonSerializer))]

namespace PostConfirmationLambda;

public class Function
{
    private readonly IDynamoDBService _dbService;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _dbService = serviceProvider.GetRequiredService<IDynamoDBService>();
    }

    public Function(IDynamoDBService dbService)
    {
        _dbService = dbService;
    }

    public async Task<CognitoPostConfirmationEvent> FunctionHandler(CognitoPostConfirmationEvent cognitoEvent,
        ILambdaContext context)
    {
        if (cognitoEvent.TriggerSource != "PostConfirmation_ConfirmSignUp")
            return cognitoEvent;

        var userName = cognitoEvent.UserName;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");

        try
        {
            if (string.IsNullOrEmpty(email))
                throw new NullReferenceException("email");

            var userData = UserDataModel.CreateFromCognitoSignUp(userName, email);

            await _dbService.WriteToDynamoAsync(userData);

            context.Logger.LogLine($"User {userData.Username} successfully inserted into DynamoDB.");

            return cognitoEvent;
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error inserting user {userName} (Email: {email}): {ex.Message}");
            throw new Exception($"Database operation failed for user {userName}");
        }
    }
}