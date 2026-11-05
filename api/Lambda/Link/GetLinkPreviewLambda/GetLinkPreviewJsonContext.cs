using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetLinkPreviewLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(LinkPreview))]
public partial class GetLinkPreviewJsonContext : JsonSerializerContext
{
}
