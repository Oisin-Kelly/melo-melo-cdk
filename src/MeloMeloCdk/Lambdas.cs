using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.Lambda;
using AssetOptions = Amazon.CDK.AWS.S3.Assets.AssetOptions;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private IFunction PostConfirmationFunction { get; set; }
    private IFunction CheckEmailExistenceFunction { get; set; }
    private IFunction GetUserFunction { get; set; }
    private IFunction GetTrackFunction { get; set; }
    private IFunction GetTracksSharedWithUserFunction { get; set; }
    private IFunction GetTracksSharedFromUserFunction { get; set; }

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
    }

    private void InitialiseLambdaIntegrations()
    {
        var methodOptions = new MethodOptions()
        {
            AuthorizationType = AuthorizationType.COGNITO,
            Authorizer = CognitoAuthorizer,
        };

        var usersResource = RestApi.Root.AddResource("users");

        var userResource = usersResource.AddResource("{username}");
        var getUserIntegration = new LambdaIntegration(GetUserFunction);
        userResource.AddMethod("GET", getUserIntegration, methodOptions);

        var sharedResource = userResource.AddResource("shared");
        var getTracksSharedFromserIntegration = new LambdaIntegration(GetTracksSharedFromUserFunction);
        sharedResource.AddMethod("GET", getTracksSharedFromserIntegration, methodOptions);

        // MARK: Tracks:

        var tracksResource = RestApi.Root.AddResource("tracks");

        var trackResource = tracksResource.AddResource("{trackId}");
        var getTrackIntegration = new LambdaIntegration(GetTrackFunction);
        trackResource.AddMethod("GET", getTrackIntegration, methodOptions);

        var tracksSharedResource = tracksResource.AddResource("shared");
        var getTracksSharedWithUserIntegration = new LambdaIntegration(GetTracksSharedWithUserFunction);
        tracksSharedResource.AddMethod("GET", getTracksSharedWithUserIntegration, methodOptions);
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