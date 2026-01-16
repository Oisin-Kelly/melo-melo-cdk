using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.Apigatewayv2;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AwsApigatewayv2Integrations;
using AssetOptions = Amazon.CDK.AWS.S3.Assets.AssetOptions;
using HttpMethod = Amazon.CDK.AWS.Apigatewayv2.HttpMethod;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private IFunction PostConfirmationFunction { get; set; }
    private IFunction CheckEmailExistenceFunction { get; set; }
    private IFunction GetUserFunction { get; set; }
    private IFunction GetTrackFunction { get; set; }
    private IFunction GetTracksSharedWithUserFunction { get; set; }
    private IFunction GetTracksSharedFromUserFunction { get; set; }

    private IFunction IsFollowingUserFunction { get; set; }
    private IFunction FollowUserFunction { get; set; }
    private IFunction GetUserFollowersFunction { get; set; }
    private IFunction GetUserFollowingFunction { get; set; }
    private IFunction UpdateProfileFunction { get; set; }

    private void InitialiseUserPoolLambdas()
    {
        PostConfirmationFunction = CreateLambdaFunction("PostConfirmationLambda");
        DynamoDbTable.GrantReadWriteData(PostConfirmationFunction);

        CheckEmailExistenceFunction = CreateLambdaFunction("CheckEmailExistenceLambda");
    }

    private void InitialiseApiLambdas()
    {
        GetUserFunction = CreateLambdaFunction("GetUserLambda");
        DynamoDbTable.GrantReadData(GetUserFunction);

        GetTrackFunction = CreateLambdaFunction("GetTrackLambda");
        DynamoDbTable.GrantReadData(GetTrackFunction);

        GetTracksSharedWithUserFunction = CreateLambdaFunction("GetTracksSharedWithUserLambda");
        DynamoDbTable.GrantReadData(GetTracksSharedWithUserFunction);

        GetTracksSharedFromUserFunction = CreateLambdaFunction("GetTracksSharedFromUserLambda");
        DynamoDbTable.GrantReadData(GetTracksSharedFromUserFunction);

        IsFollowingUserFunction = CreateLambdaFunction("IsFollowingUserLambda");
        DynamoDbTable.GrantReadData(IsFollowingUserFunction);

        FollowUserFunction = CreateLambdaFunction("FollowUserLambda");
        DynamoDbTable.GrantReadWriteData(FollowUserFunction);

        GetUserFollowersFunction = CreateLambdaFunction("GetUserFollowersLambda");
        DynamoDbTable.GrantReadData(GetUserFollowersFunction);

        GetUserFollowingFunction = CreateLambdaFunction("GetUserFollowingLambda");
        DynamoDbTable.GrantReadData(GetUserFollowingFunction);

        UpdateProfileFunction = CreateLambdaFunction("UpdateUserProfileLambda");
        DynamoDbTable.GrantReadWriteData(UpdateProfileFunction);
        DropboxBucket.GrantReadWrite(UpdateProfileFunction);
        PublicReadonlyBucket.GrantReadWrite(UpdateProfileFunction);
    }

    private void InitialiseLambdaIntegrations()
    {
        HttpLambdaIntegration CreateIntegration(IFunction function) =>
            new HttpLambdaIntegration($"{function.Node.Id}Integration", function);

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetUserFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/shared",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetTracksSharedFromUserFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/follow-status",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(IsFollowingUserFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/follow-user",
            Methods = new[] { HttpMethod.POST },
            Integration = CreateIntegration(FollowUserFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/followers",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetUserFollowersFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/users/{username}/followings",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetUserFollowingFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/{trackId}",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetTrackFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/tracks/shared",
            Methods = new[] { HttpMethod.GET },
            Integration = CreateIntegration(GetTracksSharedWithUserFunction),
        });

        HttpApi.AddRoutes(new AddRoutesOptions
        {
            Path = "/profile/update",
            Methods = new[] { HttpMethod.POST },
            Integration = CreateIntegration(UpdateProfileFunction),
        });
    }

    private IFunction CreateLambdaFunction(string lambdaName, int memorySize = 512)
    {
        var buildOption = new BundlingOptions()
        {
            Image = Runtime.DOTNET_8.BundlingImage,
            User = "root",
            OutputType = BundlingOutput.NOT_ARCHIVED,
            Command = new string[]
            {
                "/bin/sh",
                "-c",
                $"cd src/Lambda/{lambdaName} && " +
                "dotnet publish -c Release -r linux-arm64 --self-contained true && " +
                "cp bin/Release/net8.0/linux-arm64/publish/bootstrap /asset-output/"
            }
        };

        var environment = new Dictionary<string, string>()
        {
            { "TABLE_NAME", DynamoDbTable.TableName },
            { "DROPBOX_BUCKET_NAME", DropboxBucket.BucketName },
            { "PUBLIC_READONLY_BUCKET_NAME", PublicReadonlyBucket.BucketName },
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

        return new Function(this, lambdaName, lambdaProps);
    }
}