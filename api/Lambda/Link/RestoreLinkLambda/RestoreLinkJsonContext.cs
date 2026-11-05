using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace RestoreLinkLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ShareLink))]
public partial class RestoreLinkJsonContext : JsonSerializerContext
{
}
