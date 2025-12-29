using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetTracksSharedWithUserLambda;

[JsonSerializable(typeof(APIGatewayProxyRequest))]
[JsonSerializable(typeof(APIGatewayProxyResponse))]
[JsonSerializable(typeof(List<SharedTrack>))]
[JsonSerializable(typeof(ErrorResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}