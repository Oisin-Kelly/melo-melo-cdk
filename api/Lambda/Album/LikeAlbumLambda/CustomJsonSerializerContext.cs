using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Lambda.Shared;

namespace LikeAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(LikeAlbumRequest))]
[JsonSerializable(typeof(LikeAlbumResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
