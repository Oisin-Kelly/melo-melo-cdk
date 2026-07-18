using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace GetFeedLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(PaginatedResult<FeedEntry>))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
