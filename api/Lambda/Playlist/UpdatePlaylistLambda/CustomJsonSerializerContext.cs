using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace UpdatePlaylistLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(UpdatePlaylistRequest))]
[JsonSerializable(typeof(Playlist))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
