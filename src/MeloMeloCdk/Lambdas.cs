using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.Lambda;

namespace MeloMeloCdk;

public partial class MeloMeloCdkStack
{
    private IFunction PostConfirmationFunction { get; set; }
    private IFunction CheckEmailExistenceFunction { get; set; }
    
    private void InitialiseLambdas()
    {
        PostConfirmationFunction = CreateLambdaFunction("PostConfirmationLambda");
        DynamoDbTable.GrantReadWriteData(PostConfirmationFunction);
    }
    
    private IFunction CreateLambdaFunction(string lambdaName)
    {
        var buildOption = new BundlingOptions()
        {
            Image = Runtime.DOTNET_8.BundlingImage,
            User = "root",
            OutputType = BundlingOutput.ARCHIVED,
            Command = new string[]{
                "/bin/sh",
                "-c",
                "dotnet tool install -g Amazon.Lambda.Tools && " +
                "cd src && " + 
                $"cd {lambdaName} && " +
                "dotnet build && " +
                "dotnet lambda package --output-package /asset-output/function.zip"
            }
        };

        var lambdaProps = new FunctionProps()
        {
            Runtime = Runtime.DOTNET_8,
            MemorySize = 512,
            Environment = new Dictionary<string, string>()
            {
                { "TABLE_NAME", DynamoDbTable.TableName },
            },
            Handler = $"{lambdaName}::{lambdaName}.Function::FunctionHandler",
            Code = Code.FromAsset(".", new Amazon.CDK.AWS.S3.Assets.AssetOptions
            {
                Bundling = buildOption
            }),
        };

        return new Function(this, lambdaName, lambdaProps);
    }
}