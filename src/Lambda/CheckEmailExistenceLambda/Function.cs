using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Ports;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace CheckEmailExistenceLambda;

public class Function
{
    private readonly IUserValidationService _userValidationService;

    public Function(IUserValidationService userValidationService)
    {
        _userValidationService = userValidationService;
    }

    public async Task<CognitoPreAuthenticationEvent> FunctionHandler(CognitoPreAuthenticationEvent cognitoEvent,
        ILambdaContext context)
    {
        var userPoolId = cognitoEvent.UserPoolId;
        var userName = cognitoEvent.UserName;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");

        try
        {
            // make sure username and email match criteria
            ValidateUserDetails(userName, email);

// TODO: Check if email is part of database
            
            return cognitoEvent;
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in CognitoPreAuthenticationEvent {e.Message}");
            throw new Exception($"CognitoPreAuthenticationEvent {cognitoEvent} failed");
        }
    }

    private void ValidateUserDetails(string username, string? email)
    {
        if (string.IsNullOrEmpty(email))
            throw new ArgumentNullException(nameof(email));

        var isUsernameValid = _userValidationService.ValidateUsername(username);
        if (!isUsernameValid)
            throw new Exception($"Username {username} is not valid");

        var isEmailValid = _userValidationService.ValidateEmail(email);
        if (!isEmailValid)
            throw new Exception($"Email {email} is not valid");
    }
}