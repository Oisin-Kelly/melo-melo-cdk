using Ports;
using Adapters;
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

        var dynamoDbClient = new AmazonDynamoDBClient();

        services.AddSingleton<IAmazonDynamoDB>(dynamoDbClient);
        services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });
        
        var userValidationService = new UserValidationService()
        services.AddTransient<IUserValidationService>(userValidationService)
    }
}