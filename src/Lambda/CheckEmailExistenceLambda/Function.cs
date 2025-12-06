using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Microsoft.Extensions.DependencyInjection;
using Ports;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace CheckEmailExistenceLambda;

public class Function
{
    private readonly IUserValidationService _userValidationService;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _userValidationService = serviceProvider.GetRequiredService<IUserValidationService>();
    }

    public Function(IUserValidationService userValidationService)
    {
        _userValidationService = userValidationService;
    }

    public async Task<CognitoPreSignupEvent> FunctionHandler(CognitoPreSignupEvent cognitoEvent,
        ILambdaContext context)
    {
        var userName = cognitoEvent.UserName;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");
        var userPoolId = cognitoEvent.UserPoolId;

        try
        {
            if (string.IsNullOrEmpty(email))
                throw new ArgumentNullException("email");

            await ValidateUserDetails(context, userName, email, userPoolId);

            return cognitoEvent;
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in CognitoPreAuthenticationEvent {e.Message}");
            throw new Exception($"CognitoPreAuthenticationEvent failed: {e.Message}");
        }
    }

    private async Task ValidateUserDetails(ILambdaContext context, string username, string email, string userPoolId)
    {
        try
        {
            _userValidationService.ValidateUsername(username);

            await _userValidationService.ValidateEmail(email, userPoolId);
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in ValidateUserDetails {e.Message}");
            throw;
        }
    }
}