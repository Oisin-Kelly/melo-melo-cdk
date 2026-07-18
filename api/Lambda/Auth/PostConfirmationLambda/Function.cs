using Amazon.Lambda.Annotations;
using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Domain;
using Adapters.Repositories;
using Ports.Services;

namespace PostConfirmationLambda;

public sealed class Function 
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

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var userData = CreateUserFromCognitoSignUp(username, email, now);

            var userTx = _dbService.CreateTransactionPart<UserDataModel>();
            userTx.AddSaveItem(userData);

            var likesTx = _dbService.CreateTransactionPart<PlaylistDataModel>();
            likesTx.AddSaveItem(PlaylistRepository.BuildLikesPlaylistItem(username, now));

            await _dbService.ExecuteTransactWriteAsync(userTx, likesTx);

            context.Logger.LogLine($"User {userData.Username} successfully inserted into DynamoDB.");

            return cognitoEvent;
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error inserting user {username} (Email: {email}): {ex.Message}");
            throw new Exception($"Database operation failed for user {username}");
        }
    }

    private UserDataModel CreateUserFromCognitoSignUp(string username, string email, long now)
    {
        return new UserDataModel
        {
            Pk = $"USER#{username}",
            Sk = "PROFILE",
            Gsi1Pk = $"EMAIL#{email.ToLower()}",
            Gsi1Sk = "PROFILE",
            Gsi3Pk = UserRepository.SearchIndexPk,
            Gsi3Sk = UserRepository.SearchIndexSk(username),
            Username = username,
            DisplayName = username,
            Bio = "Hey! I'm using MeloMelo!",
            FollowingCount = 0,
            FollowerCount = 0,
            FollowingsPrivate = false,
            FollowersPrivate = false,
            IncomingShares = IncomingSharesSetting.Everyone,
            CreatedAt = now
        };
    }
}