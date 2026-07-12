using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace GetAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(AlbumDetailResponse))]
[JsonSerializable(typeof(PaginatedResult<Track>))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
