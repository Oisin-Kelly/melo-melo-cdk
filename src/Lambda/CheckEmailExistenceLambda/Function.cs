using Amazon.Lambda.Annotations;
using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Ports;

namespace CheckEmailExistenceLambda;

public class Function
{
    private readonly IUserValidationService _userValidationService;

    public Function(IUserValidationService userValidationService)
    {
        _userValidationService = userValidationService;
    }

    [LambdaFunction]
    public async Task<CognitoPreSignupEvent> FunctionHandler(CognitoPreSignupEvent cognitoEvent,
        ILambdaContext context)
    {
        try
        {
            var username = cognitoEvent.UserName;
            var userPoolId = cognitoEvent.UserPoolId;

            var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");
            if (string.IsNullOrWhiteSpace(email))
            {
                throw new ArgumentNullException(nameof(cognitoEvent),
                    "The request is missing a valid email attribute.");
            }

            _userValidationService.ValidateUsername(username);
            await _userValidationService.ValidateEmail(email, userPoolId);

            return cognitoEvent;
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in CognitoPreAuthenticationEvent {e.Message}");
            throw new Exception($"CognitoPreAuthenticationEvent failed: {e.Message}");
        }
    }
}