using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace UploadTrackLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(UploadTrackRequest))]
[JsonSerializable(typeof(ProcessTrackInput))]
[JsonSerializable(typeof(UploadStatus))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
