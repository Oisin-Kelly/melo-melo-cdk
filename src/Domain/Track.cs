using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public class Track
    {
        [JsonPropertyName("trackName")]
        public required string TrackName { get; set; }
        
        [JsonPropertyName("description")]
        public string? Description { get; set; }
        
        [JsonPropertyName("genre")]
        public string? Genre { get; set; }
        
        [JsonPropertyName("imageUrl")]
        public string? ImageUrl { get; set; }
        
        [JsonPropertyName("imageBgColor")]
        public string? ImageBgColor { get; set; }
        
        [JsonPropertyName("createdAt")]
        public required long CreatedAt { get; set; }
        
        [JsonPropertyName("duration")]
        public required int Duration { get; set; }
        
        [JsonPropertyName("segments")]
        public required int Segments { get; set; }
        
        [JsonPropertyName("owner")]
        public required User Owner { get; set; }
    }

    public class TrackDataModel
    {
        [DynamoDBHashKey("PK")] 
        public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")] 
        public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        [DynamoDBProperty("trackName")]
        public required string TrackName { get; set; }

        [DynamoDBProperty("description")]
        public string? Description { get; set; }

        [DynamoDBProperty("genre")]
        public string? Genre { get; set; }

        [DynamoDBProperty("imageUrl")]
        public string? ImageUrl { get; set; }

        [DynamoDBProperty("imageBgColor")]
        public string? ImageBgColor { get; set; }

        [DynamoDBProperty("createdAt")]
        public required long CreatedAt { get; set; }

        [DynamoDBProperty("duration")]
        public required int Duration { get; set; }

        [DynamoDBProperty("segments")]
        public required int Segments { get; set; }
    }
}