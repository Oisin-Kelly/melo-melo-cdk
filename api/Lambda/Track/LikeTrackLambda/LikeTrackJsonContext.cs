using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace LikeTrackLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(LikeTrackRequest))]
[JsonSerializable(typeof(LikeTrackResponse))]
public partial class LikeTrackJsonContext : JsonSerializerContext
{
}
