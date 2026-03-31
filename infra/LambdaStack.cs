using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.S3;
using AssetOptions = Amazon.CDK.AWS.S3.Assets.AssetOptions;
using Constructs;

namespace MeloMeloCdk;

public class LambdaStack : BaseStack
{
    public IFunction PostConfirmationFunction { get; }
    public IFunction CheckEmailExistenceFunction { get; }
    public ApiFunctions ApiFunctions { get; }

    private ITable Table { get; }
    private IBucket DropboxBucket { get; }
    private IBucket PublicReadonlyBucket { get; }
    private IBucket PrivateReadonlyBucket { get; }

    public LambdaStack(Construct scope, string id, ITable table, IBucket dropboxBucket, IBucket publicReadonlyBucket,
        IBucket privateReadonlyBucket, IStackProps props = null) : base(scope, id, props)
    {
        Table = table;
        DropboxBucket = dropboxBucket;
        PublicReadonlyBucket = publicReadonlyBucket;
        PrivateReadonlyBucket = privateReadonlyBucket;

        PostConfirmationFunction =
            CreateLambdaFunction("PostConfirmationLambda");
        table.GrantReadWriteData(PostConfirmationFunction);

        CheckEmailExistenceFunction =
            CreateLambdaFunction("CheckEmailExistenceLambda");

        var getUser = CreateLambdaFunction("GetUserLambda");
        table.GrantReadData(getUser);

        var getTrack = CreateLambdaFunction("GetTrackLambda");
        table.GrantReadData(getTrack);

        var getTracksSharedWithUser =
            CreateLambdaFunction("GetTracksSharedWithUserLambda");
        table.GrantReadData(getTracksSharedWithUser);

        var getTracksSharedFromUser =
            CreateLambdaFunction("GetTracksSharedFromUserLambda");
        table.GrantReadData(getTracksSharedFromUser);

        var isFollowingUser = CreateLambdaFunction("IsFollowingUserLambda");
        table.GrantReadData(isFollowingUser);

        var followUser = CreateLambdaFunction("FollowUserLambda");
        table.GrantReadWriteData(followUser);

        var getUserFollowers =
            CreateLambdaFunction("GetUserFollowersLambda");
        table.GrantReadData(getUserFollowers);

        var getUserFollowing =
            CreateLambdaFunction("GetUserFollowingLambda");
        table.GrantReadData(getUserFollowing);

        var updateProfile = CreateLambdaFunction("UpdateUserProfileLambda");
        table.GrantReadWriteData(updateProfile);
        dropboxBucket.GrantReadWrite(updateProfile);
        publicReadonlyBucket.GrantReadWrite(updateProfile);

        var getDropboxPresignedUrl =
            CreateLambdaFunction("GetDropboxPresignedUrlLambda");
        dropboxBucket.GrantWrite(getDropboxPresignedUrl);

        ApiFunctions = new ApiFunctions(
            GetUser: getUser,
            GetTrack: getTrack,
            GetTracksSharedWithUser: getTracksSharedWithUser,
            GetTracksSharedFromUser: getTracksSharedFromUser,
            IsFollowingUser: isFollowingUser,
            FollowUser: followUser,
            GetUserFollowers: getUserFollowers,
            GetUserFollowing: getUserFollowing,
            UpdateProfile: updateProfile,
            GetDropboxPresignedUrl: getDropboxPresignedUrl
        );
    }

    private Function CreateLambdaFunction(string lambdaName, int memorySize = 512)
    {
        var buildOption = new BundlingOptions()
        {
            Image = Runtime.DOTNET_10.BundlingImage,
            User = "root",
            OutputType = BundlingOutput.NOT_ARCHIVED,
            Command =
            [
                "/bin/sh",
                "-c",
                $"cd api/Lambda/{lambdaName} && " +
                "dotnet publish -c Release -r linux-arm64 --self-contained true && " +
                "cp bin/Release/net10.0/linux-arm64/publish/bootstrap /asset-output/"
            ]
        };

        var environment = new Dictionary<string, string>()
        {
            { "TABLE_NAME", Table.TableName },
            { "DROPBOX_BUCKET_NAME", DropboxBucket.BucketName },
            { "PUBLIC_READONLY_BUCKET_NAME", PublicReadonlyBucket.BucketName },
            { "PRIVATE_READONLY_BUCKET_NAME", PrivateReadonlyBucket.BucketName },
            { "ANNOTATIONS_HANDLER", "FunctionHandler" },
        };

        var lambdaProps = new FunctionProps
        {
            Runtime = Runtime.PROVIDED_AL2023,
            Architecture = Architecture.ARM_64,
            Handler = "bootstrap",
            Code = Code.FromAsset(".", new AssetOptions { Bundling = buildOption }),
            MemorySize = memorySize,
            Environment = environment,
        };

        var function = new Function(this, lambdaName, lambdaProps);
        function.ApplyRemovalPolicy(DeletionPolicy);
        return function;
    }
}