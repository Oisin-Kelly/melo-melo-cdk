using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class ActivityType
{
    public const string TrackLiked = "TRACK_LIKED";        // someone liked your track
    public const string AlbumLiked = "ALBUM_LIKED";        // someone liked your album
    public const string TrackShared = "TRACK_SHARED";      // someone shared a track with you
    public const string AlbumShared = "ALBUM_SHARED";      // someone shared an album with you
}

// One row of GET /activity, hydrated with the actor's profile and the target's name.
public record ActivityEntry
{
    [JsonPropertyName("type")] public required string Type { get; set; }

    [JsonPropertyName("actor")] public required UserSummary Actor { get; set; }

    [JsonPropertyName("targetType")] public required string TargetType { get; set; }

    [JsonPropertyName("targetId")] public required string TargetId { get; set; }

    [JsonPropertyName("targetName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetName { get; set; }

    [JsonPropertyName("createdAt")] public required long CreatedAt { get; set; }
}

public record ActivityItemDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBProperty("type")] public required string Type { get; set; }

    [DynamoDBProperty("actorUsername")] public required string ActorUsername { get; set; }

    [DynamoDBProperty("targetType")] public required string TargetType { get; set; }

    [DynamoDBProperty("targetId")] public required string TargetId { get; set; }

    [DynamoDBProperty("createdAt")] public required long CreatedAt { get; set; }

    [DynamoDBProperty("expiresAt")] public required long ExpiresAt { get; set; }
}

public static class ActivityItems
{
    public static ActivityItemDataModel Build(string recipient, string type, string actorUsername,
        string targetType, string targetId, long now)
    {
        var shortId = Guid.NewGuid().ToString("N")[..8];
        return new ActivityItemDataModel
        {
            Pk = $"ACTIVITY#{recipient}",
            Sk = $"DATE#{now}#{shortId}",
            Type = type,
            ActorUsername = actorUsername,
            TargetType = targetType,
            TargetId = targetId.ToLowerInvariant(),
            CreatedAt = now,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(90).ToUnixTimeSeconds(),
        };
    }
}
