using Amazon.Lambda.CognitoEvents;
using Amazon.Lambda.Core;
using Ports;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace CheckEmailExistenceLambda;

public class Function
{
    private IUserValidationService ValidationService { get; set; }

    public async Task<CognitoPreAuthenticationEvent> FunctionHandler(CognitoPreAuthenticationEvent cognitoEvent,
        ILambdaContext context)
    {
        var userPoolId = cognitoEvent.UserPoolId;
        var email = cognitoEvent.Request.UserAttributes.GetValueOrDefault("email");
        var userName = cognitoEvent.UserName;


        return cognitoEvent;
    }
}