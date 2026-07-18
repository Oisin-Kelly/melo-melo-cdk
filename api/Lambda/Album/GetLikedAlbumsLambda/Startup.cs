using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Adapters.Repositories;
using Adapters.Services;
using Ports.Repositories;
using Ports.Services;

namespace GetLikedAlbumsLambda;

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

        builder.Services.AddTransient<IAlbumLikeRepository, AlbumLikeRepository>();

        return builder;
    }
}
