using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace GetAlbumLikesLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<AlbumLiker>))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
