using Amazon.DynamoDBv2.DataModel;

namespace Domain;

// Minimal existence probe: BatchGet any table item by PK/SK and read nothing but the keys.
// Used for activity liveness — checking that the SHARED#/LIKE# record which produced an activity
// row still exists — without having to know or map each relationship's full DataModel type.
public record KeyProbeDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }
}
