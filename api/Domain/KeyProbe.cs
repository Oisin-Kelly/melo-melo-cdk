using Amazon.DynamoDBv2.DataModel;

namespace Domain;

// Minimal liveness probe: BatchGet any table item by PK/SK and read only the keys plus the
// relationship timestamp. Used for activity liveness — checking that the exact SHARED#/LIKE#
// record which produced an activity row still exists — without having to know or map each
// relationship's full DataModel type. A like record carries likedAt, a share record sharedAt;
// both are written with the same `now` as the activity row's createdAt.
public record KeyProbeDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBProperty("likedAt")] public long? LikedAt { get; set; }

    [DynamoDBProperty("sharedAt")] public long? SharedAt { get; set; }
}
