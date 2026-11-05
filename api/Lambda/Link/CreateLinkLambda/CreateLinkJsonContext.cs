using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace CreateLinkLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ShareLink))]
[JsonSerializable(typeof(CreateShareLinkRequest))]
public partial class CreateLinkJsonContext : JsonSerializerContext
{
}
