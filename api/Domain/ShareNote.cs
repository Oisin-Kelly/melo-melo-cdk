using System.Text.Json.Serialization;

namespace Domain;

/// The viewer's own share of a track or album: when its owner shared it with them and what
/// they said. On the detail GETs for recipients only (one row per item × recipient, so
/// there's never more than one).
public record ShareNote
{
    [JsonPropertyName("sharedAt")] public required long SharedAt { get; set; }

    [JsonPropertyName("caption")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Caption { get; set; }
}
