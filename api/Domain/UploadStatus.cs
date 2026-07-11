using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class UploadState
{
    public const string Processing = "PROCESSING";
    public const string Complete = "COMPLETE";
    public const string Failed = "FAILED";
}

public record UploadStatus
{
    [JsonPropertyName("trackId")]
    public required string TrackId { get; set; }

    [JsonPropertyName("status")]
    public required string Status { get; set; }

    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; set; }

    [JsonPropertyName("createdAt")]
    public required long CreatedAt { get; set; }
}

public record UploadStatusDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBProperty("status")]
    public required string Status { get; set; }

    [DynamoDBProperty("error")]
    public string? Error { get; set; }

    [DynamoDBProperty("createdAt")]
    public required long CreatedAt { get; set; }

    // Epoch seconds — DynamoDB TTL attribute, records self-expire
    [DynamoDBProperty("expiresAt")]
    public required long ExpiresAt { get; set; }

    [DynamoDBIgnore]
    public string TrackId => Sk.Replace("UPLOAD#", "");
}
