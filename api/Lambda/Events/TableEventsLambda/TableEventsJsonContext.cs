using System.Text.Json.Serialization;
using Amazon.Lambda.DynamoDBEvents;

namespace TableEventsLambda;

[JsonSerializable(typeof(DynamoDBEvent))]
[JsonSerializable(typeof(StreamsEventResponse))]
public partial class TableEventsJsonContext : JsonSerializerContext
{
}
