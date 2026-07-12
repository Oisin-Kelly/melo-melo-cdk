using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace GetDropboxPresignedUrlLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PresignedUrlResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
