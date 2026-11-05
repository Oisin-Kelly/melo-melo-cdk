using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace ShareTrackLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ShareTrackRequest))]
[JsonSerializable(typeof(ShareTrackResponse))]
public partial class ShareTrackJsonContext : JsonSerializerContext
{
}
