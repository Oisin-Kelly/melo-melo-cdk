using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Adapters;
using Adapters.Services;
using Adapters.Validation;
using Ports.Services;
using Ports.Validation;

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

        builder.Services.AddMeloMeloData(tableName);

        // TrackValidationService's ctor needs the Dropbox keyed S3 service (only its
        // sync ValidateShare runs in this lambda)
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));

        builder.Services.AddTransient<ITrackValidationService, TrackValidationService>();

        return builder;
    }
}
