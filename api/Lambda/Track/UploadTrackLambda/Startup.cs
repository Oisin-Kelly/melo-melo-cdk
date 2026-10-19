using Amazon.Lambda.Annotations;
using Amazon.S3;
using Amazon.StepFunctions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Adapters;
using Adapters.Services;
using Adapters.Validation;
using Ports.Services;
using Ports.Validation;

namespace UploadTrackLambda;

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

        // TrackValidationService needs the Dropbox keyed S3 service to verify the
        // staged audio object (existence + size) before processing kicks off
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
            new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));

        builder.Services.AddTransient<ITrackValidationService, TrackValidationService>();

        builder.Services.AddSingleton<IAmazonStepFunctions>(new AmazonStepFunctionsClient());

        return builder;
    }
}
