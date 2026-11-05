using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace DeletePlaylistLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
public partial class DeletePlaylistJsonContext : JsonSerializerContext
{
}
