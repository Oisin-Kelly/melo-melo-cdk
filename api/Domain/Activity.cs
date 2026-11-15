using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class ActivityType
{
    public const string TrackLiked = "TRACK_LIKED";        // someone liked your track
    public const string AlbumLiked = "ALBUM_LIKED";        // someone liked your album
    public const string TrackShared = "TRACK_SHARED";      // someone shared a track with you
    public const string AlbumShared = "ALBUM_SHARED";      // someone shared an album with you
    public const string UserFollowed = "USER_FOLLOWED";    // someone started following you
}

public static class ActivityTargetType
{
    public const string User = "USER";
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

    // For building the target's readable URL (/{owner}/{slug}); null on follow rows and on
    // items created before slugs existed (the client falls back to the id route)
    [JsonPropertyName("targetOwner")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetOwner { get; set; }

    [JsonPropertyName("targetSlug")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetSlug { get; set; }

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

}

public static class ActivityItems
{
    // Every activity row is derived from the record that caused it (a like, a share, a
    // follow) by the stream consumer (Adapters/Events/ActivityEvents), so its key is built
    // from that record alone — deterministic, so a redelivered change rewrites the same row
    // and a removal can rebuild the exact key to delete. Rows don't expire: they last as
    // long as the like/share/follow behind them.

    public static string Pk(string recipient) => $"ACTIVITY#{recipient}";

    /// Someone liked the recipient's track/album: DATE#{likedAt}#LIKE#{liker}#{TYPE}#{id}
    public static string LikeSk(long likedAt, string likerUsername, string targetType, string targetId) =>
        $"DATE#{likedAt}#LIKE#{likerUsername}#{targetType}#{targetId.ToLowerInvariant()}";

    /// A track/album was shared with the recipient: DATE#{sharedAt}#SHARE#{TYPE}#{id} (one
    /// share per item × recipient, so the item identifies it)
    public static string ShareSk(long sharedAt, string targetType, string targetId) =>
        $"DATE#{sharedAt}#SHARE#{targetType}#{targetId.ToLowerInvariant()}";

    /// Someone followed the recipient: DATE#{followedAt}#FOLLOW#{follower}
    public static string FollowSk(string followerUsername, long followTimestamp) =>
        $"DATE#{followTimestamp}#FOLLOW#{followerUsername}";

    public static ActivityItemDataModel Build(string recipient, string sk, string type, string actorUsername,
        string targetType, string targetId, long createdAt) => new()
    {
        Pk = Pk(recipient),
        Sk = sk,
        Type = type,
        ActorUsername = actorUsername,
        TargetType = targetType,
        TargetId = targetId.ToLowerInvariant(),
        CreatedAt = createdAt,
    };
}
