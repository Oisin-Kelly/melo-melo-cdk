using System.Text.Json.Serialization;
using Amazon.Lambda.APIGatewayEvents;
using Domain;
using Lambda.Shared;

namespace ShareTrackLambda;

[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyRequest))]
[JsonSerializable(typeof(APIGatewayHttpApiV2ProxyResponse))]
[JsonSerializable(typeof(ShareTrackRequest))]
[JsonSerializable(typeof(ShareTrackResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
