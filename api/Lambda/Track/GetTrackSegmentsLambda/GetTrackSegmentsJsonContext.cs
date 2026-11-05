using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace GetTrackSegmentsLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(TrackStreamResponse))]
public partial class GetTrackSegmentsJsonContext : JsonSerializerContext
{
}
