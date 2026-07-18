using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class FeedItemType
{
    public const string Track = "TRACK";
    public const string Album = "ALBUM";

    public static readonly string[] All = [Track, Album];
}

public record FeedEntry
{
    [JsonPropertyName("type")] public required string Type { get; set; }

    [JsonPropertyName("sender")] public required UserSummary Sender { get; set; }

    [JsonPropertyName("sharedAt")] public required long SharedAt { get; set; }

    [JsonPropertyName("caption")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Caption { get; set; }

    [JsonPropertyName("track")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TrackSummary? Track { get; set; }

    [JsonPropertyName("album")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AlbumSummary? Album { get; set; }
}

// Unifies "tracks shared with me" and "albums shared with me" into one
// per-recipient partition so a single query returns both, date-sorted and
// filterable by type. Base SK is deterministic ({TYPE}#{targetId}) so
// unshare/delete is a keyed delete; GSI1 carries the all-types date sort and
// GSI2 ({TYPE}#DATE#{ts}) the per-type date sort — both pure key conditions.
public record FeedItemDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI2", AttributeName = "GSI2SK")]
    public string? Gsi2Sk { get; set; }

    [DynamoDBProperty("type")] public required string Type { get; set; }

    [DynamoDBProperty("targetId")] public required string TargetId { get; set; }

    [DynamoDBProperty("senderUsername")] public required string SenderUsername { get; set; }

    [DynamoDBProperty("caption")] public string? Caption { get; set; }

    [DynamoDBProperty("sharedAt")] public required long SharedAt { get; set; }
}

// Builds feed put-items / delete-keys so share and delete paths can add them to
// their existing batch or transaction (feed stays consistent with the share).
public static class FeedItems
{
    public static FeedItemDataModel Build(string recipient, string type, string targetId,
        string senderUsername, long sharedAt, string? caption = null) => new()
    {
        Pk = $"FEED#{recipient}",
        Sk = $"{type}#{targetId.ToLowerInvariant()}",
        Gsi1Pk = $"FEED#{recipient}",
        Gsi1Sk = $"DATE#{sharedAt}",
        Gsi2Sk = $"{type}#DATE#{sharedAt}",
        Type = type,
        TargetId = targetId.ToLowerInvariant(),
        SenderUsername = senderUsername,
        Caption = caption,
        SharedAt = sharedAt,
    };

    public static (string Pk, string Sk) Key(string recipient, string type, string targetId) =>
        ($"FEED#{recipient}", $"{type}#{targetId.ToLowerInvariant()}");
}