using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace ShareAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ShareAlbumRequest))]
[JsonSerializable(typeof(ShareAlbumResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
