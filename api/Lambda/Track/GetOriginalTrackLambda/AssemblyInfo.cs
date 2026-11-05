using Amazon.Lambda.Annotations;
using Amazon.Lambda.Core;
using Amazon.Lambda.Serialization.SystemTextJson;
using GetOriginalTrackLambda;

[assembly: LambdaGlobalProperties(GenerateMain = true)]
[assembly: LambdaSerializer(typeof(SourceGeneratorLambdaJsonSerializer<GetOriginalTrackJsonContext>))]
