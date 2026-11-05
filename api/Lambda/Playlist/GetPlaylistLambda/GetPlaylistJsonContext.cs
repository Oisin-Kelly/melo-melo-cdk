using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetPlaylistLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PlaylistDetailResponse))]
[JsonSerializable(typeof(PaginatedResult<PlaylistTrackEntry>))]
public partial class GetPlaylistJsonContext : JsonSerializerContext
{
}
