using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace LikeAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(LikeAlbumRequest))]
[JsonSerializable(typeof(LikeAlbumResponse))]
public partial class LikeAlbumJsonContext : JsonSerializerContext
{
}
