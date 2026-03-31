using Adapters;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports;

namespace GetTrackLambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();
        
        var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                         ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");

        builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
    
        builder.Services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });

        builder.Services.AddTransient<IUserRepository, UserRepository>();
        builder.Services.AddTransient<ITrackRepository, TrackRepository>();
        builder.Services.AddTransient<ISharedTrackRepository, SharedTrackRepository>();
    
        return builder;
    }
}