using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public static class PlaylistType
{
    public const string Likes = "LIKES";
    public const string Custom = "CUSTOM";
}

public record CreatePlaylistRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("imageKey")] public string? ImageKey { get; set; }
}

public record UpdatePlaylistRequest
{
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("imageKey")] public string? ImageKey { get; set; }
    [JsonPropertyName("clearedImage")] public bool ClearedImage { get; set; }
}

public record Playlist
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("type")]
    public required string Type { get; set; }

    [JsonPropertyName("imageUrl")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("imageBgColor")]
    public string? ImageBgColor { get; set; }

    [JsonPropertyName("createdAt")]
    public required long CreatedAt { get; set; }
}

public record PlaylistDataModel
{
    [DynamoDBHashKey("PK")]
    public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")]
    public required string Sk { get; set; }

    // GSI3 lists a user's playlists: PLAYLISTS#{owner} / DATE#{createdAt}
    // (likes uses a max sentinel date so it always sorts first)
    [DynamoDBGlobalSecondaryIndexHashKey("GSI3", AttributeName = "GSI3PK")]
    public string? Gsi3Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI3", AttributeName = "GSI3SK")]
    public string? Gsi3Sk { get; set; }

    [DynamoDBProperty("name")]
    public required string Name { get; set; }

    [DynamoDBProperty("description")]
    public string? Description { get; set; }

    [DynamoDBProperty("type")]
    public required string Type { get; set; }

    [DynamoDBProperty("imageUrl")]
    public string? ImageUrl { get; set; }

    [DynamoDBProperty("imageBgColor")]
    public string? ImageBgColor { get; set; }

    [DynamoDBProperty("createdAt")]
    public required long CreatedAt { get; set; }

    [DynamoDBIgnore]
    public string PlaylistId => Sk.Replace("PLAYLIST#", "");
}

public record PlaylistTrackDataModel
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
    public string TrackId => Sk.Replace("TRACK#", "");
}
