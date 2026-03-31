using Adapters;
using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports;

namespace GetDropboxPresignedUrlLambda;

[LambdaStartup]
public class Startup
{
    public HostApplicationBuilder ConfigureHostBuilder()
    {
        var builder = new HostApplicationBuilder();

        var dropboxBucketName = Environment.GetEnvironmentVariable("DROPBOX_BUCKET_NAME")
                                ?? throw new InvalidOperationException("DROPBOX_BUCKET_NAME environment variable is required");

        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddTransient<IS3Service>(sp =>
        {
            var client = sp.GetRequiredService<IAmazonS3>();
            return new S3Service(client, dropboxBucketName);
        });

        return builder;
    }
}
