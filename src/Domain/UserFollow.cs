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

    [DynamoDBRangeKey("SK")] 
    public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    [DynamoDBProperty("createdAt")]
    public long? CreatedAt { get; set; }
}