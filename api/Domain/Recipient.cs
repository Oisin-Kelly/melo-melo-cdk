using System.Text.Json.Serialization;

namespace Domain;

public record Recipient
{
    [JsonPropertyName("user")] public required UserSummary User { get; set; }

    [JsonPropertyName("sharedAt")] public required long SharedAt { get; set; }
}

public record RecipientsResponse
{
    [JsonPropertyName("items")] public required List<Recipient> Items { get; set; }
}
