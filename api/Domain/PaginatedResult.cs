using System.Text.Json.Serialization;

namespace Domain;

public record PaginatedResult<T>
{
    [JsonPropertyName("items")]
    public required List<T> Items { get; init; }

    [JsonPropertyName("nextCursor")]
    public string? NextCursor { get; init; }
}
