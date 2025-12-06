using System.Runtime.CompilerServices;
using Amazon.DynamoDBv2.DataModel;

namespace Domain
{
    public class SharedTrack
    {
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

        [DynamoDBProperty("createdAt")]
        public required long CreatedAt { get; set; }
    }
}