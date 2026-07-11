using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public record TrackLiker
{
    [JsonPropertyName("user")]
    public required User User { get; set; }

    [JsonPropertyName("likedAt")]
    public required long LikedAt { get; set; }
}

public record LikeDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    [DynamoDBProperty("trackOwnerUsername")]
    public required string TrackOwnerUsername { get; set; }

    [DynamoDBProperty("likedAt")]
    public required long LikedAt { get; set; }

    [DynamoDBIgnore]
    public string TrackId => Pk.Replace("TRACK#", "");

    [DynamoDBIgnore]
    public string LikerUsername => Sk.Replace("LIKE#", "");
}
