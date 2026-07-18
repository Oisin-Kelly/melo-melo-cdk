using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Lambda.Shared;

namespace AddPlaylistTrackLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(AddPlaylistTrackResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
