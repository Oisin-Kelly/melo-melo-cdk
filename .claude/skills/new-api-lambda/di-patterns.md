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

## S3 Services (for image / audio processing, file access)

Three keyed variants — register only the ones the Lambda needs. Consumers inject with `[FromKeyedServices("Dropbox" | "Public" | "Private")] IS3Service`.

```csharp
var dropboxBucketName = Environment.GetEnvironmentVariable("DROPBOX_BUCKET_NAME")
                        ?? throw new InvalidOperationException("DROPBOX_BUCKET_NAME environment variable is required");

var publicReadonlyBucketName = Environment.GetEnvironmentVariable("PUBLIC_READONLY_BUCKET_NAME")
                               ?? throw new InvalidOperationException("PUBLIC_READONLY_BUCKET_NAME environment variable is required");

var privateReadonlyBucketName = Environment.GetEnvironmentVariable("PRIVATE_READONLY_BUCKET_NAME")
                                ?? throw new InvalidOperationException("PRIVATE_READONLY_BUCKET_NAME environment variable is required");

builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), publicReadonlyBucketName));
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Private", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), privateReadonlyBucketName));
```

## Image Service (needs S3 keyed services above)

```csharp
builder.Services.AddTransient<IImageService, ImageService>();
```

## User Validation (needs Cognito)

`UserValidationService` uses `IUserPoolService` (Cognito) for signup/profile validation. Recipient filtering (`GetValidatedRecipientsAsync`) lives on `IUserRepository`, not here.

```csharp
builder.Services.AddSingleton<IAmazonCognitoIdentityProvider>(new AmazonCognitoIdentityProviderClient());
builder.Services.AddTransient<IUserPoolService, UserPoolService>();
builder.Services.AddTransient<IUserValidationService, UserValidationService>();
```

## Track Validation

FluentValidation for the request fields, plus `ValidateUploadedAudioAsync` (staged audio existence + size check via HeadObject), so it needs the Dropbox keyed S3 service.

```csharp
builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
builder.Services.AddTransient<ITrackValidationService, TrackValidationService>();
```

## Album / Playlist Validation

Pure FluentValidation + sanitisation, no external clients.

```csharp
builder.Services.AddTransient<IAlbumValidationService, AlbumValidationService>();
builder.Services.AddTransient<IPlaylistValidationService, PlaylistValidationService>();
```

## Step Functions client (for Lambdas that kick off state machines)

```csharp
builder.Services.AddSingleton<IAmazonStepFunctions>(new AmazonStepFunctionsClient());
```

The `STATE_MACHINE_ARN` env var is wired up in `infra/Program.cs` after the SFN stack is created (`lambda.UploadTrackFunction.AddEnvironment("STATE_MACHINE_ARN", ...)`), not in `LambdaStack.CreateLambdaFunction`. Read it directly in the Lambda's constructor.

## Audio Service (Step Function-invoked Lambdas only)

`AudioService` requires both Dropbox (read source) and Private (write segments) keyed S3 services, and expects `/opt/bin/ffmpeg` + `/opt/bin/ffprobe` from the layers attached in `StepFunctionStack`.

```csharp
builder.Services.AddTransient<IAudioService, AudioService>();
```

## Full example: UpdateUserProfileLambda Startup (most complex HTTP)

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

## Full example: UploadTrackLambda Startup (kicks off Step Function)

```csharp
// DynamoDB (for IUserRepository recipient lookup)
builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
builder.Services.AddTransient<IDynamoDBService>(provider =>
{
    var client = provider.GetRequiredService<IAmazonDynamoDB>();
    return new DynamoDBService(client, tableName);
});

// Repository (recipient validation via GetValidatedRecipientsAsync)
builder.Services.AddTransient<IUserRepository, UserRepository>();

// Validation (Dropbox S3 for the staged-audio existence/size check)
builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
builder.Services.AddTransient<ITrackValidationService, TrackValidationService>();

// Step Functions
builder.Services.AddSingleton<IAmazonStepFunctions>(new AmazonStepFunctionsClient());
```

## Full example: ProcessTrackLambda Startup (SFN-invoked audio worker)

```csharp
// DynamoDB
builder.Services.AddSingleton<IAmazonDynamoDB>(new AmazonDynamoDBClient());
builder.Services.AddTransient<IDynamoDBService>(provider =>
    new DynamoDBService(provider.GetRequiredService<IAmazonDynamoDB>(), tableName));

// All three S3 keyed services
builder.Services.AddSingleton<IAmazonS3>(new AmazonS3Client());
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Dropbox", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), dropboxBucketName));
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Public", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), publicReadonlyBucketName));
builder.Services.AddKeyedTransient<IS3Service, S3Service>("Private", (sp, _) =>
    new S3Service(sp.GetRequiredService<IAmazonS3>(), privateReadonlyBucketName));

// Repositories
builder.Services.AddTransient<IUserRepository, UserRepository>();
builder.Services.AddTransient<ITrackRepository, TrackRepository>();

// Services
builder.Services.AddTransient<IAudioService, AudioService>();
builder.Services.AddTransient<IImageService, ImageService>();
```
