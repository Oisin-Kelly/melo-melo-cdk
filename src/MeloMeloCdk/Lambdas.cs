using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.APIGateway;
using Amazon.CDK.AWS.IAM;
using Amazon.CDK.AWS.Lambda;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private IFunction PostConfirmationFunction { get; set; }
    private IFunction CheckEmailExistenceFunction { get; set; }
    private IFunction GetUserFunction { get; set; }

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
    }

    private void InitialiseLambdaIntegrations()
    {
        var methodOptions = new MethodOptions()
        {
            AuthorizationType = AuthorizationType.COGNITO,
            Authorizer = CognitoAuthorizer,
        };

        var getUserIntegration = new LambdaIntegration(GetUserFunction);
        var usersResource = RestApi.Root.AddResource("users");
        var userResource = usersResource.AddResource("{username}");
    
        userResource.AddMethod("GET", getUserIntegration, methodOptions);
    }
 
    private IFunction CreateLambdaFunction(string lambdaName, int memorySize = 512)
    {
        var buildOption = new BundlingOptions()
        {
            Image = Runtime.DOTNET_8.BundlingImage,
            User = "root",
            OutputType = BundlingOutput.ARCHIVED,
            Command = new string[]
            {
                "/bin/sh",
                "-c",
                "dotnet tool install -g Amazon.Lambda.Tools && " +
                "cd src && " +
                $"cd Lambda/{lambdaName} && " +
                "dotnet build && " +
                "dotnet lambda package --output-package /asset-output/function.zip"
            }
        };

        var environment = new Dictionary<string, string>()
        {
            { "TABLE_NAME", DynamoDbTable.TableName },
        };

        var lambdaProps = new FunctionProps()
        {
            Runtime = Runtime.DOTNET_8,
            MemorySize = memorySize,
            Environment = environment,
            Handler = $"{lambdaName}::{lambdaName}.Function::FunctionHandler",
            Code = Code.FromAsset(".", new Amazon.CDK.AWS.S3.Assets.AssetOptions
            {
                Bundling = buildOption
            }),
        };

        return new Function(this, lambdaName, lambdaProps);
    }
}