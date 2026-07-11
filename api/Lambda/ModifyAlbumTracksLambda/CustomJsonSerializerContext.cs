using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace ModifyAlbumTracksLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ModifyAlbumTracksRequest))]
[JsonSerializable(typeof(ModifyAlbumTracksResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
