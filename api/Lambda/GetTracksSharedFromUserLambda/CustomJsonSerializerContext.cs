using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace GetTracksSharedFromUserLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<SharedTrack>))]
[JsonSerializable(typeof(ErrorResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
