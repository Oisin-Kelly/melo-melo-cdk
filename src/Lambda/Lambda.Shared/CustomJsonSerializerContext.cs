using System.Text.Json.Serialization;
using Lambda.Shared;

[JsonSerializable(typeof(ErrorResponse))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}