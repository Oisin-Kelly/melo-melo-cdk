using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace SetPlaylistTracksLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(SetPlaylistTracksRequest))]
[JsonSerializable(typeof(SetPlaylistTracksResponse))]
public partial class SetPlaylistTracksJsonContext : JsonSerializerContext
{
}
