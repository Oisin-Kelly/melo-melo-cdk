using System.Text.Json.Serialization;
using Domain;

[JsonSerializable(typeof(ProcessTrackInput))]
[JsonSerializable(typeof(ProcessTrackOutput))]
public partial class CustomJsonSerializerContext : JsonSerializerContext
{
}
