using System.Text.Json.Serialization;

namespace Domain;

// Slim DTOs for list/row contexts. Full User/Track/Album objects are returned only
// by the detail GETs (/users/{username}, /tracks/{id}, /albums/{id}); everywhere an
// object is embedded or listed, one of these summaries is used instead — enough to
// render a row, with the detail GET as the hydration path.

public record UserSummary
{
    [JsonPropertyName("username")] public required string Username { get; set; }

    [JsonPropertyName("displayName")] public string? DisplayName { get; set; }

    [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }

    [JsonPropertyName("imageBgColor")] public string? ImageBgColor { get; set; }

    public static UserSummary From(User user) => new()
    {
        Username = user.Username,
        DisplayName = user.DisplayName,
        ImageUrl = user.ImageUrl,
        ImageBgColor = user.ImageBgColor
    };
}

public record TrackSummary
{
    [JsonPropertyName("id")] public required string Id { get; set; }

    [JsonPropertyName("name")] public required string Name { get; set; }

    [JsonPropertyName("duration")] public required int Duration { get; set; }

    [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }

    [JsonPropertyName("imageBgColor")] public string? ImageBgColor { get; set; }

    [JsonPropertyName("createdAt")] public required long CreatedAt { get; set; }

    [JsonPropertyName("likedByMe")] public required bool LikedByMe { get; set; }

    [JsonPropertyName("owner")] public required UserSummary Owner { get; set; }

    public static TrackSummary From(TrackDataModel track, User owner, bool likedByMe) => new()
    {
        Id = track.TrackId,
        Name = track.TrackName,
        Duration = track.Duration,
        ImageUrl = track.ImageUrl,
        ImageBgColor = track.ImageBgColor,
        CreatedAt = track.CreatedAt,
        LikedByMe = likedByMe,
        Owner = UserSummary.From(owner)
    };
}

public record AlbumSummary
{
    [JsonPropertyName("id")] public required string Id { get; set; }

    [JsonPropertyName("name")] public required string Name { get; set; }

    [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }

    [JsonPropertyName("imageBgColor")] public string? ImageBgColor { get; set; }

    [JsonPropertyName("trackCount")] public required int TrackCount { get; set; }

    [JsonPropertyName("totalDurationSeconds")] public required int TotalDurationSeconds { get; set; }

    [JsonPropertyName("createdAt")] public required long CreatedAt { get; set; }

    [JsonPropertyName("likedByMe")] public required bool LikedByMe { get; set; }

    [JsonPropertyName("owner")] public required UserSummary Owner { get; set; }

    public static AlbumSummary From(AlbumDataModel album, User owner, bool likedByMe) => new()
    {
        Id = album.AlbumId,
        Name = album.Name,
        ImageUrl = album.ImageUrl,
        ImageBgColor = album.ImageBgColor,
        TrackCount = album.TrackCount,
        TotalDurationSeconds = album.TotalDurationSeconds,
        CreatedAt = album.CreatedAt,
        LikedByMe = likedByMe,
        Owner = UserSummary.From(owner)
    };
}
