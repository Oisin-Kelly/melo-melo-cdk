using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace UpdateUserProfileLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(UpdateProfileRequest))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}