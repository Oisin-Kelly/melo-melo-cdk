using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public class SharedTrack
    {
        [JsonPropertyName("caption")]
        public string? Caption { get; set; }
        
        [JsonPropertyName("sharedAt")]
        public required long SharedAt { get; set; }
        
        [JsonPropertyName("track")]
        public required Track Track { get; set; }
    }

    public class SharedTrackDataModel
    {
        [DynamoDBHashKey("PK")] 
        public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")] 
        public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        [DynamoDBProperty("caption")]
        public string? Caption { get; set; }

        [DynamoDBProperty("sharedAt")]
        public required long SharedAt { get; set; }
    }
}