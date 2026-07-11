using Adapters;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports;

namespace ShareTrackLambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();

        var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                        ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");

        var dropboxBucketName = Environment.GetEnvironmentVariable("DROPBOX_BUCKET_NAME")
                                ?? throw new InvalidOperationException(
                                    "DROPBOX_BUCKET_NAME environment variable is required");

        builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        builder.Services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });

        // TrackValidationService's ctor needs the Dropbox keyed S3 service (only its
        // sync ValidateShare runs in this lambda)
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));

        builder.Services.AddTransient<IUserRepository, UserRepository>();
        builder.Services.AddTransient<ITrackRepository, TrackRepository>();
        builder.Services.AddTransient<ISharedTrackRepository, SharedTrackRepository>();
        builder.Services.AddTransient<ITrackValidationService, TrackValidationService>();

        return builder;
    }
}
