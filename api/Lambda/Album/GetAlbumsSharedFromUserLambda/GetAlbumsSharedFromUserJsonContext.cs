using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetAlbumsSharedFromUserLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<SharedAlbum>))]
public partial class GetAlbumsSharedFromUserJsonContext : JsonSerializerContext
{
}
