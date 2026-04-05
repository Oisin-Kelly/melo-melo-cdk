using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public record SharedTrack
    {
        [JsonPropertyName("caption")]
        public string? Caption { get; set; }
        
        [JsonPropertyName("sharedAt")]
        public required long SharedAt { get; set; }
        
        [JsonPropertyName("track")]
        public required Track Track { get; set; }
    }

    public record SharedTrackDataModel
    {
        [DynamoDBHashKey("PK")]
        public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")]
        public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", "GSI2", AttributeName = "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        // DATE#{ISO-timestamp} — chronological sort in GSI1
        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        // SENDER#{senderUserId}#DATE#{ISO-timestamp} — sender-filtered sort in GSI2
        [DynamoDBGlobalSecondaryIndexRangeKey("GSI2", AttributeName = "GSI2SK")]
        public string? Gsi2Sk { get; set; }

        [DynamoDBProperty("trackOwnerUsername")]
        public string? TrackOwnerUsername { get; set; }

        [DynamoDBProperty("caption")]
        public string? Caption { get; set; }

        [DynamoDBProperty("sharedAt")]
        public required long SharedAt { get; set; }
    }
}