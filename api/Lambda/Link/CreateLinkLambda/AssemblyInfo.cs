using Amazon.Lambda.Annotations;
using Amazon.Lambda.Core;
using Amazon.Lambda.Serialization.SystemTextJson;
using CreateLinkLambda;

[assembly: LambdaGlobalProperties(GenerateMain = true)]
[assembly: LambdaSerializer(typeof(SourceGeneratorLambdaJsonSerializer<CreateLinkJsonContext>))]
