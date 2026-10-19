using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Adapters;
using Adapters.Services;
using Ports.Services;

namespace DeleteTrackLambda;

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

        var publicReadonlyBucketName = Environment.GetEnvironmentVariable("PUBLIC_READONLY_BUCKET_NAME")
                                       ?? throw new InvalidOperationException(
                                           "PUBLIC_READONLY_BUCKET_NAME environment variable is required");

        var privateReadonlyBucketName = Environment.GetEnvironmentVariable("PRIVATE_READONLY_BUCKET_NAME")
                                        ?? throw new InvalidOperationException(
                                            "PRIVATE_READONLY_BUCKET_NAME environment variable is required");

        builder.Services.AddMeloMeloData(tableName);

        // AudioService (delete segments) needs Dropbox + Private; ImageService
        // (delete cover) needs Dropbox + Public
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), publicReadonlyBucketName));
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Private", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), privateReadonlyBucketName));

        builder.Services.AddTransient<IAudioService, AudioService>();
        builder.Services.AddTransient<IImageService, ImageService>();

        return builder;
    }
}
