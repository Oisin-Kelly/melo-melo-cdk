using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Lambda.Shared;

namespace GetTrackAppearsInLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(TrackAppearsInResponse))]
public partial class GetTrackAppearsInJsonContext : JsonSerializerContext
{
}
