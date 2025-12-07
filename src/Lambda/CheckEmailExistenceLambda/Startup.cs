using Ports;
using Adapters;
using Amazon.CognitoIdentityProvider;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;

namespace CheckEmailExistenceLambda;

[LambdaStartup]
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        var cognitoClient = new AmazonCognitoIdentityProviderClient();
        services.AddSingleton<IAmazonCognitoIdentityProvider>(cognitoClient);
        
        services.AddTransient<IUserPoolService, UserPoolService>();
        services.AddTransient<IUserValidationService, UserValidationService>();
    }
}