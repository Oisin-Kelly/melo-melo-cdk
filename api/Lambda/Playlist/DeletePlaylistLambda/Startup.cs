using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Adapters;
using Adapters.Services;
using Ports.Services;

namespace DeletePlaylistLambda;

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

        builder.Services.AddMeloMeloData(tableName);

        // ImageService (cover processing/deletion) needs the Dropbox + Public keyed S3 services
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), publicReadonlyBucketName));
        builder.Services.AddTransient<IImageService, ImageService>();

        return builder;
    }
}
