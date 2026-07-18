using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace SetAlbumTracksLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(SetAlbumTracksRequest))]
[JsonSerializable(typeof(SetAlbumTracksResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
