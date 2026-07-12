using System.Collections.Generic;
using System.IO;
using Amazon.CDK;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.S3;
using AssetOptions = Amazon.CDK.AWS.S3.Assets.AssetOptions;
using Constructs;

namespace MeloMeloCdk;

public abstract class BaseStack : Stack
{
    protected string Env { get; }
    protected RemovalPolicy DeletionPolicy { get; }

    protected BaseStack(Construct scope, string id, IStackProps props = null) : base(scope, id, props)
    {
        Env = System.Environment.GetEnvironmentVariable("ENVIRONMENT") ?? "dev";
        DeletionPolicy = Env == "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    }

    // USE_PREBUILT=1 skips docker bundling and takes the binary that scripts/build-lambdas.sh wrote to api/.build/{Name}/bootstrap.
    private static Code ResolveCode(string lambdaName, AssetOptions assetOptions)
    {
        if (System.Environment.GetEnvironmentVariable("USE_PREBUILT") != "1")
            return Code.FromAsset("api", assetOptions);

        var prebuiltDir = Path.Combine("api", ".build", lambdaName);
        if (!File.Exists(Path.Combine(prebuiltDir, "bootstrap")))
            throw new System.InvalidOperationException(
                $"USE_PREBUILT=1 but {prebuiltDir}/bootstrap does not exist — run scripts/build-lambdas.sh first");

        return Code.FromAsset(prebuiltDir);
    }

    // lambdaPath is "{Group}/{Name}" (e.g. "Track/UploadTrackLambda") — lambdas live in
    // domain group folders under api/Lambda/. The construct id and .build dir use the
    // bare name, so grouping never changes logical ids or prebuilt paths.
    protected Function CreateAotFunction(string lambdaPath, ITable table, IBucket dropboxBucket,
        IBucket publicReadonlyBucket, IBucket privateReadonlyBucket, int memorySize = 512,
        Duration timeout = null, ILayerVersion[] layers = null)
    {
        var slash = lambdaPath.IndexOf('/');
        if (slash < 0)
            throw new System.ArgumentException(
                $"lambdaPath must be \"Group/Name\", got \"{lambdaPath}\"", nameof(lambdaPath));
        var group = lambdaPath[..slash];
        var lambdaName = lambdaPath[(slash + 1)..];

        var buildOption = new BundlingOptions
        {
            Image = Runtime.DOTNET_10.BundlingImage,
            User = "root",
            OutputType = BundlingOutput.NOT_ARCHIVED,
            Command =
            [
                "/bin/sh",
                "-c",
                $"cd Lambda/{lambdaPath} && " +
                "dotnet publish -c Release -r linux-arm64 --self-contained true && " +
                "cp bin/Release/net10.0/linux-arm64/publish/bootstrap /asset-output/"
            ]
        };

        var assetOptions = new AssetOptions
        {
            Bundling = buildOption,
            // gitignore-style, last match wins: drop everything under Lambda/, then
            // re-include the group dir, drop its lambdas, re-include just this one
            Exclude =
            [
                "**/bin/**",
                "**/obj/**",
                ".build/**",
                "PublishLambdas.proj",
                "Tests/**",
                "Lambda/*",
                $"!Lambda/{group}",
                $"Lambda/{group}/*",
                $"!Lambda/{lambdaPath}",
                $"!Lambda/{lambdaPath}/**",
                "!Lambda/Lambda.Shared",
                "!Lambda/Lambda.Shared/**",
                "!Lambda/Directory.Build.props",
            ],
        };

        var function = new Function(this, lambdaName, new FunctionProps
        {
            Runtime = Runtime.PROVIDED_AL2023,
            Architecture = Architecture.ARM_64,
            Handler = "bootstrap",
            Code = ResolveCode(lambdaName, assetOptions),
            MemorySize = memorySize,
            Timeout = timeout ?? Duration.Seconds(30),
            Environment = new Dictionary<string, string>
            {
                { "TABLE_NAME", table.TableName },
                { "DROPBOX_BUCKET_NAME", dropboxBucket.BucketName },
                { "PUBLIC_READONLY_BUCKET_NAME", publicReadonlyBucket.BucketName },
                { "PRIVATE_READONLY_BUCKET_NAME", privateReadonlyBucket.BucketName },
                { "ANNOTATIONS_HANDLER", "FunctionHandler" },
            },
            Layers = layers,
        });
        
        function.ApplyRemovalPolicy(DeletionPolicy);
        return function;
    }
}
