using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public record UserFollow
{
    [JsonPropertyName("followStatus")]
    public required bool FollowStatus { get; set; }
    
    [JsonPropertyName("createdAt")]
    public long? CreatedAt { get; set; }
}

public record UserFollowDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    // USER#{followerUsername} — deterministic, one row per (target × follower), so a
    // double-follow is a guarded no-op rather than a duplicate row
    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    // DATE#{ISO-timestamp}#TARGET#{usernameToFollow} — chronological sort in GSI1
    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    // FOLLOWERS#{usernameToFollow} / DATE#{timestamp}#USER#{followerUsername} — the
    // target's followers newest-first (the base-table SK sorts by username)
    [DynamoDBGlobalSecondaryIndexHashKey("GSI3", AttributeName = "GSI3PK")]
    public string? Gsi3Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI3", AttributeName = "GSI3SK")]
    public string? Gsi3Sk { get; set; }

    [DynamoDBProperty("createdAt")]
    public long? CreatedAt { get; set; }
}