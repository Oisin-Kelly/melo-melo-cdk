# Dependency Injection Patterns

All DI is configured in `Startup.cs` using `HostApplicationBuilder`.

## DynamoDB (always required)

```csharp
var tableName = Environment.GetEnvironmentVariable("TABLE_NAME")
                ?? throw new InvalidOperationException("TABLE_NAME environment variable is required");

builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
builder.Services.AddTransient<IDynamoDBService>(provider =>
{
    var client = provider.GetRequiredService<IAmazonDynamoDB>();
    return new DynamoDBService(client, tableName);
});
```

## Repositories

```csharp
// User repository (no extra dependencies)
builder.Services.AddTransient<IUserRepository, UserRepository>();

// Track repository (depends on IUserRepository — register both)
builder.Services.AddTransient<IUserRepository, UserRepository>();
builder.Services.AddTransient<ITrackRepository, TrackRepository>();

// Shared track repository (no extra dependencies)
builder.Services.AddTransient<ISharedTrackRepository, SharedTrackRepository>();
```

## S3 Services (for image processing / file access)

```csharp
var dropboxBucketName = Environment.GetEnvironmentVariable("DROPBOX_BUCKET_NAME")
                        ?? throw new InvalidOperationException("DROPBOX_BUCKET_NAME environment variable is required");

var publicReadonlyBucketName = Environment.GetEnvironmentVariable("PUBLIC_READONLY_BUCKET_NAME")
                               ?? throw new InvalidOperationException("PUBLIC_READONLY_BUCKET_NAME environment variable is required");

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
```

## Image Service (needs S3 keyed services above)

```csharp
builder.Services.AddTransient<IImageService, ImageService>();
```

## User Validation (needs Cognito)

```csharp
builder.Services.AddSingleton<IAmazonCognitoIdentityProvider>(new AmazonCognitoIdentityProviderClient());
builder.Services.AddTransient<IUserPoolService, UserPoolService>();
builder.Services.AddTransient<IUserValidationService, UserValidationService>();
```

## Full example: UpdateUserProfileLambda Startup (most complex)

```csharp
// DynamoDB
builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
builder.Services.AddTransient<IDynamoDBService>(provider =>
{
    var client = provider.GetRequiredService<IAmazonDynamoDB>();
    return new DynamoDBService(client, tableName);
});

// S3 keyed services
builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), publicReadonlyBucketName));

// Repositories
builder.Services.AddTransient<IUserRepository, UserRepository>();

// Cognito
builder.Services.AddSingleton<IAmazonCognitoIdentityProvider>(new AmazonCognitoIdentityProviderClient());
builder.Services.AddTransient<IUserPoolService, UserPoolService>();

// Services
builder.Services.AddTransient<IUserValidationService, UserValidationService>();
builder.Services.AddTransient<IImageService, ImageService>();
```
