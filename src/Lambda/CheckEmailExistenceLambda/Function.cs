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
    private readonly IDynamoDBService _dynamoDbService;

    public Function()
    {
        var services = new ServiceCollection();
        new Startup().ConfigureServices(services);
        var serviceProvider = services.BuildServiceProvider();

        _userValidationService = serviceProvider.GetRequiredService<IUserValidationService>();
        _dynamoDbService = serviceProvider.GetRequiredService<IDynamoDBService>();
    }

    public Function(IDynamoDBService dynamoDbService, IUserValidationService userValidationService)
    {
        _userValidationService = userValidationService;
        _dynamoDbService = dynamoDbService;
    }

    public async Task<CognitoPreAuthenticationEvent> FunctionHandler(CognitoPreAuthenticationEvent cognitoEvent,
        ILambdaContext context)
    {
        var userName = cognitoEvent.UserName;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");

        try
        {
            if (string.IsNullOrEmpty(email))
                throw new ArgumentNullException("email");

            await ValidateUserDetails(context, userName, email);

            return cognitoEvent;
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in CognitoPreAuthenticationEvent {e.Message}");
            throw new Exception($"CognitoPreAuthenticationEvent {cognitoEvent} failed");
        }
    }

    private async Task ValidateUserDetails(ILambdaContext context, string username, string email)
    {
        try
        {
            _userValidationService.ValidateUsername(username);

            await _userValidationService.ValidateEmail(email);
        }
        catch (Exception e)
        {
            context.Logger.LogLine($"Error in ValidateUserDetails {e.Message}");
            throw;
        }
    }
}