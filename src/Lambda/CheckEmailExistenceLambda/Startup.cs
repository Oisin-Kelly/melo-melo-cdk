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
        var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                        ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");
        var userPoolId = Environment.GetEnvironmentVariable("USER_POOL_ID")
                        ?? throw new InvalidOperationException("USER_POOL_ID environment variable is required");
        
        var dynamoDbClient = new AmazonDynamoDBClient();
        services.AddSingleton<IAmazonDynamoDB>(dynamoDbClient);

        var cognitoClient = new AmazonCognitoIdentityProviderClient();
        services.AddSingleton<IAmazonCognitoIdentityProvider>(cognitoClient);
        
        services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });
        
        services.AddTransient<IUserPoolService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonCognitoIdentityProvider>();
            return new UserPoolService(client, userPoolId);
        });

        services.AddTransient<IUserValidationService>(provider =>
        {
            var service = provider.GetRequiredService<IUserPoolService>();
            return new UserValidationService(service);
        });
    }
}