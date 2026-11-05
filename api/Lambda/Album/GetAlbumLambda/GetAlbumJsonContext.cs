using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(AlbumDetailResponse))]
[JsonSerializable(typeof(PaginatedResult<TrackSummary>))]
public partial class GetAlbumJsonContext : JsonSerializerContext
{
}
