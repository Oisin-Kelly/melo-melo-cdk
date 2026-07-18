using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace GetLikedAlbumsLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<AlbumSummary>))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
