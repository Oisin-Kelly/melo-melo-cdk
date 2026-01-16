using Adapters;
using Amazon.CognitoIdentityProvider;
using Amazon.DynamoDBv2;
using Amazon.Lambda.Annotations;
using Amazon.S3;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Ports;

namespace UpdateUserProfileLambda;

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

        builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
        builder.Services.AddTransient<IDynamoDBService>(provider =>
        {
            var client = provider.GetRequiredService<IAmazonDynamoDB>();
            return new DynamoDBService(client, tableName);
        });
        
        builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
        {
            var client = sp.GetRequiredService<IAmazonS3>();
            return new S3Service(client, dropboxBucketName);
        });
        builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
        {
            var client = sp.GetRequiredService<IAmazonS3>();
            return new S3Service(client, publicReadonlyBucketName);
        });
        
        builder.Services.AddTransient<IUserRepository, UserRepository>();
        builder.Services.AddSingleton<IAmazonCognitoIdentityProvider>(new AmazonCognitoIdentityProviderClient());

        builder.Services.AddTransient<IUserPoolService, UserPoolService>();
        builder.Services.AddTransient<IUserValidationService, UserValidationService>();
        builder.Services.AddTransient<IImageService, ImageService>();

        return builder;
    }
}