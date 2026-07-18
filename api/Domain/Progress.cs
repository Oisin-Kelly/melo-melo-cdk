using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class ProgressContextType
{
    public const string Track = "TRACK";
    public const string Album = "ALBUM";
    public const string Playlist = "PLAYLIST";

    public static readonly string[] All = [Track, Album, Playlist];
}

public record UpdateProgressRequest
{
    [JsonPropertyName("contextType")] public string? ContextType { get; set; }
    [JsonPropertyName("contextId")] public string? ContextId { get; set; }
    [JsonPropertyName("trackId")] public string? TrackId { get; set; }
    [JsonPropertyName("positionSeconds")] public int? PositionSeconds { get; set; }
    [JsonPropertyName("completed")] public bool? Completed { get; set; }
}

public record ProgressEntry
{
    [JsonPropertyName("contextType")] public required string ContextType { get; set; }
    [JsonPropertyName("contextId")] public required string ContextId { get; set; }
    [JsonPropertyName("trackId")] public required string TrackId { get; set; }
    [JsonPropertyName("positionSeconds")] public required int PositionSeconds { get; set; }
    [JsonPropertyName("updatedAt")] public required long UpdatedAt { get; set; }
    [JsonPropertyName("track")] public required TrackSummary Track { get; set; }
}

public record UserProgressDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBProperty("contextType")] public required string ContextType { get; set; }

    [DynamoDBProperty("contextId")] public required string ContextId { get; set; }

    [DynamoDBProperty("trackId")] public required string TrackId { get; set; }

    [DynamoDBProperty("positionSeconds")] public required int PositionSeconds { get; set; }

    [DynamoDBProperty("updatedAt")] public required long UpdatedAt { get; set; }

    // Epoch seconds — table TTL attribute (shared with upload status)
    [DynamoDBProperty("expiresAt")] public required long ExpiresAt { get; set; }
}
