using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public record UpdateTrackRequest
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("genre")] public string? Genre { get; set; }
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("imageKey")] public string? ImageKey { get; set; }
        [JsonPropertyName("clearedImage")] public bool ClearedImage { get; set; }
    }

    public record ShareTrackRequest
    {
        [JsonPropertyName("add")] public List<string> Add { get; set; } = [];
        [JsonPropertyName("remove")] public List<string> Remove { get; set; } = [];
        [JsonPropertyName("caption")] public string? Caption { get; set; }
    }

    public record Track
    {
        [JsonPropertyName("id")]
        public required string Id { get; set; }
        
        [JsonPropertyName("name")]
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
        public required UserSummary Owner { get; set; }
        
        // ---------------------------------------------

        [JsonPropertyName("likeCount")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public int? LikeCount { get; set; }

        [JsonPropertyName("likedByMe")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public bool? LikedByMe { get; set; }

        // Direct-share recipient count (grants excluded) — owner-only, like likeCount
        [JsonPropertyName("shareCount")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public int? ShareCount { get; set; }
    }

    public record TrackDataModel
    {
        [DynamoDBHashKey("PK")] 
        public required string Pk { get; set; }

        [DynamoDBRangeKey("SK")] 
        public required string Sk { get; set; }

        [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
        public required string Gsi1Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
        public string? Gsi1Sk { get; set; }

        // GSI3 lists a user's own tracks newest-first: USER#{owner} / DATE#{createdAt}
        [DynamoDBGlobalSecondaryIndexHashKey("GSI3", AttributeName = "GSI3PK")]
        public string? Gsi3Pk { get; set; }

        [DynamoDBGlobalSecondaryIndexRangeKey("GSI3", AttributeName = "GSI3SK")]
        public string? Gsi3Sk { get; set; }

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

        [DynamoDBProperty("likeCount")]
        public int LikeCount { get; set; }

        [DynamoDBProperty("shareCount")]
        public int ShareCount { get; set; }

        [DynamoDBIgnore]
        public string OwnerUsername => Pk.Replace("USER#", "");

        [DynamoDBIgnore] public string TrackId => Sk.Replace("TRACK#", "");
    }
}