using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Lambda.Shared;

namespace ModifyPlaylistTracksLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ModifyPlaylistTracksRequest))]
[JsonSerializable(typeof(ModifyPlaylistTracksResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
