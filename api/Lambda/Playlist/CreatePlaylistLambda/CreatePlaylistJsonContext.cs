using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace CreatePlaylistLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(CreatePlaylistRequest))]
[JsonSerializable(typeof(Playlist))]
public partial class CreatePlaylistJsonContext : JsonSerializerContext
{
}
