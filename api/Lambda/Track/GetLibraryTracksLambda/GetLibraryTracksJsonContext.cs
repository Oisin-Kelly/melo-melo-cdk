using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetLibraryTracksLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<TrackSummary>))]
public partial class GetLibraryTracksJsonContext : JsonSerializerContext
{
}
