using Ports;
using Adapters;
using Amazon.CognitoIdentityProvider;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CheckEmailExistenceLambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();
        
        builder.Services.AddSingleton<IAmazonCognitoIdentityProvider>(new AmazonCognitoIdentityProviderClient());

        builder.Services.AddTransient<IUserPoolService, UserPoolService>();
        builder.Services.AddTransient<IUserValidationService, UserValidationService>();
    
        return builder;
    }
}