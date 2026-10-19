using Domain;

namespace Lambda.Tests.Support;

// Domain objects as the (mocked) repositories would return them
public static class Fakes
{
    public static UserSummary Summary(string username) => new() { Username = username, DisplayName = username };

    public static Track Track(string id, string owner, int duration = 180, int? likeCount = 3, int? shareCount = 2,
        string? imageUrl = null) => new()
    {
        Id = id,
        TrackName = $"Track {id}",
        CreatedAt = 1_700_000_000_000,
        Duration = duration,
        Owner = Summary(owner),
        LikeCount = likeCount,
        ShareCount = shareCount,
        ImageUrl = imageUrl,
    };

    public static TrackSummary TrackSummary(string id, string owner) => new()
    {
        Id = id,
        Name = $"Track {id}",
        Duration = 180,
        CreatedAt = 1_700_000_000_000,
        LikedByMe = false,
        Owner = Summary(owner),
    };

    public static Album Album(string id, string owner, int? likeCount = 4, int? shareCount = 2,
        string? imageUrl = null) => new()
    {
        Id = id,
        Name = $"Album {id}",
        TrackCount = 2,
        TotalDurationSeconds = 360,
        CreatedAt = 1_700_000_000_000,
        OwnerUsername = owner,
        LikeCount = likeCount,
        ShareCount = shareCount,
        ImageUrl = imageUrl,
    };

    public static Playlist Playlist(string id, string type = PlaylistType.Custom) => new()
    {
        Id = id,
        Name = $"Playlist {id}",
        Type = type,
        CreatedAt = 1_700_000_000_000,
    };

    public static User User(string username, bool followersPrivate = false, bool followingsPrivate = false) => new()
    {
        Username = username,
        DisplayName = username,
        FollowerCount = 0,
        FollowingCount = 0,
        FollowersPrivate = followersPrivate,
        FollowingsPrivate = followingsPrivate,
        CreatedAt = 1_700_000_000_000,
    };

    public static PaginatedResult<T> Page<T>(params T[] items) => new() { Items = [.. items], NextCursor = null };
}
