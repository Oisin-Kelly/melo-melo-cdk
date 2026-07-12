using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;

namespace FollowUserLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(FollowUserResponse))]
[JsonSerializable(typeof(FollowUserRequest))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}