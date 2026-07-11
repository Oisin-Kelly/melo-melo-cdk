using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public record Album
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("createdAt")]
    public required long CreatedAt { get; set; }

    // Populated on the shared-with-me feed; omitted on the owner's own album list
    [JsonPropertyName("owner")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public User? Owner { get; set; }

    // For access checks only — never serialized
    [JsonIgnore]
    public string? OwnerUsername { get; set; }
}

public record SharedAlbum
{
    [JsonPropertyName("album")]
    public required Album Album { get; set; }

    [JsonPropertyName("sharedAt")]
    public required long SharedAt { get; set; }
}

public record CreateAlbumRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("trackIds")] public List<string> TrackIds { get; set; } = [];
}

public record UpdateAlbumRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
}

public record AlbumDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    // GSI3 lists a user's albums newest-first: ALBUMS#{owner} / DATE#{createdAt}
    // (GSI1 is taken by the by-id lookup: ALBUM#{id} / INFO)
    [DynamoDBGlobalSecondaryIndexHashKey("GSI3", AttributeName = "GSI3PK")]
    public string? Gsi3Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI3", AttributeName = "GSI3SK")]
    public string? Gsi3Sk { get; set; }

    [DynamoDBProperty("name")]
    public required string Name { get; set; }

    [DynamoDBProperty("description")]
    public string? Description { get; set; }

    [DynamoDBProperty("createdAt")]
    public required long CreatedAt { get; set; }

    [DynamoDBIgnore]
    public string OwnerUsername => Pk.Replace("USER#", "");

    [DynamoDBIgnore]
    public string AlbumId => Sk.Replace("ALBUM#", "");
}

public record AlbumTrackDataModel
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

    [DynamoDBProperty("addedAt")]
    public required long AddedAt { get; set; }

    [DynamoDBIgnore]
    public string AlbumId => Pk.Replace("ALBUM#", "");

    [DynamoDBIgnore]
    public string TrackId => Sk.Replace("TRACK#", "");
}

public record AlbumShareDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    [DynamoDBProperty("albumOwnerUsername")]
    public required string AlbumOwnerUsername { get; set; }

    [DynamoDBProperty("sharedAt")]
    public required long SharedAt { get; set; }

    [DynamoDBIgnore]
    public string AlbumId => Pk.Replace("ALBUM#", "");

    [DynamoDBIgnore]
    public string Recipient => Sk.Replace("SHARED#", "");
}

// Deliberately carries NO GSI attributes: grants must never appear in the direct-share feeds
public record AlbumTrackGrantDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    [DynamoDBProperty("trackOwnerUsername")]
    public required string TrackOwnerUsername { get; set; }

    [DynamoDBProperty("albumId")]
    public required string AlbumId { get; set; }

    [DynamoDBProperty("grantedAt")]
    public required long GrantedAt { get; set; }

    public static string BuildSk(string recipient, string albumId) => $"SHARED#{recipient}#ALBUM#{albumId}";
}
