using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace CreateAlbumLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(CreateAlbumRequest))]
[JsonSerializable(typeof(Album))]
public partial class CreateAlbumJsonContext : JsonSerializerContext
{
}
