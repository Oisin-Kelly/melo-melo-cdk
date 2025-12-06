using Adapters;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Ports;

namespace GetTrackLambda;

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

        services.AddTransient<IUserRepository>(provider =>
        {
            var client = provider.GetRequiredService<IDynamoDBService>();
            return new UserRepository(client);
        });
        
        services.AddTransient<ITrackRepository>(provider =>
        {
            var dbClient = provider.GetRequiredService<IDynamoDBService>();
            var userRepository = provider.GetRequiredService<IUserRepository>();
            return new TrackRepository(dbClient, userRepository);
        });

        services.AddTransient<ITrackSharingService>(provider =>
        {
            var client = provider.GetRequiredService<IDynamoDBService>();
            return new TrackSharingService(client);
        });
    }
}