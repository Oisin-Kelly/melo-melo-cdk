using Amazon.Lambda.Annotations;
using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Domain;
using Ports;

namespace PostConfirmationLambda;

public class Function 
{
    private readonly IDynamoDBService _dbService;

    public Function(IDynamoDBService dbService)
    {
        _dbService = dbService;
    }

    [LambdaFunction]
    public async Task<CognitoPostConfirmationEvent> FunctionHandler(CognitoPostConfirmationEvent cognitoEvent,
        ILambdaContext context)
    {
        if (cognitoEvent.TriggerSource != "PostConfirmation_ConfirmSignUp")
            return cognitoEvent;

        var username = cognitoEvent.UserName;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");

        try
        {
            if (string.IsNullOrWhiteSpace(email))
                throw new NullReferenceException("email");

            var userData = CreateUserFromCognitoSignUp(username, email);

            await _dbService.WriteToDynamoAsync(userData);

            context.Logger.LogLine($"User {userData.Username} successfully inserted into DynamoDB.");

            return cognitoEvent;
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error inserting user {username} (Email: {email}): {ex.Message}");
            throw new Exception($"Database operation failed for user {username}");
        }
    }

    private UserDataModel CreateUserFromCognitoSignUp(string username, string email)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        return new UserDataModel
        {
            Pk = $"USER#{username}",
            Sk = "PROFILE",
            Gsi1Pk = $"EMAIL#{email.ToLower()}",
            Gsi1Sk = "PROFILE",
            Username = username,
            DisplayName = username,
            Bio = "Hey! I'm using MeloMelo!",
            FollowingCount = 0,
            FollowerCount = 0,
            FollowingsPrivate = false,
            FollowersPrivate = false,
            CreatedAt = now
        };
    }
}