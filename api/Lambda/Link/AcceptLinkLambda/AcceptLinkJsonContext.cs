using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace AcceptLinkLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(LinkTarget))]
public partial class AcceptLinkJsonContext : JsonSerializerContext
{
}
