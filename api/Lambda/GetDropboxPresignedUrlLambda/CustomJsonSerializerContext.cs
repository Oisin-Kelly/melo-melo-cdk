using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Lambda.Shared;

namespace GetDropboxPresignedUrlLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(PresignedUrlResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
