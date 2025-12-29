using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;

namespace GetUserLambda;

[JsonSerializable(typeof(APIGatewayProxyRequest))]
[JsonSerializable(typeof(APIGatewayProxyResponse))]
[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(ErrorResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}