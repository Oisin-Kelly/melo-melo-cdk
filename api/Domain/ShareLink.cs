using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

// Share links: a link invites whoever holds it to become a normal recipient of a track or album.
// Accepting runs the ordinary share upsert, so access, feed, Shared with and Remove from my library
// all work as for a username share. The link only decides who may claim it, and until when.
public static class ShareLinkKind
{
    public const string Track = "TRACK";
    public const string Album = "ALBUM";
}

// What a link is right now, as everyone sees it
public static class ShareLinkState
{
    public const string Active = "ACTIVE";
    public const string Expired = "EXPIRED";
    public const string Revoked = "REVOKED";
}

// What the public invite screen shows. Revoked, unknown and deleted-item links all read the same
// ("unavailable"), with no sender, so a link reveals nothing once it's been taken back.
public static class LinkPreviewState
{
    public const string Valid = "VALID";
    public const string Expired = "EXPIRED";
    public const string Unavailable = "UNAVAILABLE";
}

// The signed-in viewer's relation to a link's item (GET /links/{token}/viewer)
public static class LinkViewerRelation
{
    public const string None = "NONE";
    public const string Own = "OWN";
    public const string AlreadyHave = "ALREADY_HAVE";
}

public static partial class ShareLinks
{
    // Tracks this short or shorter preview in full; longer ones get a clip this long
    public const int PreviewClipSeconds = 30;

    public const string DefaultExpiry = "7d";

    // Same limit as a share's caption — it becomes the share's caption on accept
    public const int MaxCaptionLength = 300;

    // How long an expired link's record is kept, so it can still say "This link has expired"
    // rather than "isn't available". After that the table's TTL removes it.
    public static readonly TimeSpan ExpiredGrace = TimeSpan.FromDays(30);

    private static readonly Dictionary<string, TimeSpan> Expiries = new()
    {
        ["24h"] = TimeSpan.FromHours(24),
        ["7d"] = TimeSpan.FromDays(7),
        ["30d"] = TimeSpan.FromDays(30),
    };

    public static IReadOnlyCollection<string> ExpiryOptions => Expiries.Keys;

    public static TimeSpan? ExpiryFor(string? option) =>
        Expiries.TryGetValue(option ?? DefaultExpiry, out var span) ? span : null;

    // 128 random bits, base64url (22 characters): unguessable, and safe in a URL path
    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [GeneratedRegex("^[A-Za-z0-9_-]{22}$")]
    private static partial Regex TokenShape();

    // Anything else can't be a token, so it's unavailable without a lookup
    public static bool IsWellFormed(string? token) => token is not null && TokenShape().IsMatch(token);

    public static (string Pk, string Sk) Key(string token) => ($"LINK#{token}", "META");

    // The owner's listing of one item's links: GSI3 LINKS#{KIND}#{targetId} / DATE#{createdAt}
    public static string ListPk(string kind, string targetId) => $"LINKS#{kind}#{targetId}";

    public static string StateOf(ShareLinkDataModel link, long nowMs) =>
        link.RevokedAt is not null ? ShareLinkState.Revoked
        : nowMs >= link.LinkExpiresAt ? ShareLinkState.Expired
        : ShareLinkState.Active;

    public static ShareLink ToShareLink(ShareLinkDataModel link, long nowMs) => new()
    {
        Token = link.Token,
        Kind = link.Kind,
        TargetId = link.TargetId,
        CreatedAt = link.CreatedAt,
        ExpiresAt = link.LinkExpiresAt,
        AllowPreview = link.AllowPreview,
        AcceptedCount = link.AcceptedCount,
        Caption = link.Caption,
        State = StateOf(link, nowMs),
    };
}

// A link as its owner sees it (Share dialog list, the invite screen's own-link state)
public record ShareLink
{
    [JsonPropertyName("token")] public required string Token { get; set; }
    [JsonPropertyName("kind")] public required string Kind { get; set; }
    [JsonPropertyName("targetId")] public required string TargetId { get; set; }
    [JsonPropertyName("createdAt")] public required long CreatedAt { get; set; }
    [JsonPropertyName("expiresAt")] public required long ExpiresAt { get; set; }
    [JsonPropertyName("allowPreview")] public required bool AllowPreview { get; set; }
    [JsonPropertyName("acceptedCount")] public required int AcceptedCount { get; set; }
    [JsonPropertyName("caption")] public string? Caption { get; set; }
    [JsonPropertyName("state")] public required string State { get; set; }
}

// GET /links?kind=&targetId=
public record ShareLinkList
{
    [JsonPropertyName("items")] public required List<ShareLink> Items { get; set; }
}

public record CreateShareLinkRequest
{
    // TRACK | ALBUM
    [JsonPropertyName("kind")] public string? Kind { get; set; }

    [JsonPropertyName("targetId")] public string? TargetId { get; set; }

    // "24h" | "7d" | "30d"; omitted → 7d
    [JsonPropertyName("expiresIn")] public string? ExpiresIn { get; set; }

    // Omitted → true: a link plays a preview unless the owner switches it off
    [JsonPropertyName("allowPreview")] public bool? AllowPreview { get; set; }

    // Optional note (≤300): shown on the invite screen, and becomes the share's caption on accept
    [JsonPropertyName("caption")] public string? Caption { get; set; }
}

// One playable thing on the invite screen: a 30s clip, or the whole track when it's that short
public record LinkPreviewAudio
{
    [JsonPropertyName("url")] public required string Url { get; set; }
    [JsonPropertyName("isFullTrack")] public required bool IsFullTrack { get; set; }
}

public record LinkPreviewTrack
{
    [JsonPropertyName("id")] public required string Id { get; set; }
    [JsonPropertyName("name")] public required string Name { get; set; }
    [JsonPropertyName("duration")] public required int Duration { get; set; }

    // Null when previews are off for the link
    [JsonPropertyName("preview")] public LinkPreviewAudio? Preview { get; set; }
}

// GET /links/{token} — public. Everything but `state` is null when unavailable.
public record LinkPreview
{
    [JsonPropertyName("state")] public required string State { get; set; }

    [JsonPropertyName("kind")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Kind { get; set; }

    [JsonPropertyName("sender")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public UserSummary? Sender { get; set; }

    [JsonPropertyName("name")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Name { get; set; }

    [JsonPropertyName("imageUrl")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("imageBgColor")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ImageBgColor { get; set; }

    [JsonPropertyName("genre")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Genre { get; set; }

    // Seconds: the track's length, or the album's total
    [JsonPropertyName("duration")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Duration { get; set; }

    [JsonPropertyName("expiresAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? ExpiresAt { get; set; }

    [JsonPropertyName("allowPreview")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? AllowPreview { get; set; }

    // The sender's note, on a valid link only
    [JsonPropertyName("caption")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Caption { get; set; }

    // The track itself (one entry), or the album's tracklist in order. Only on a valid link.
    [JsonPropertyName("tracks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<LinkPreviewTrack>? Tracks { get; set; }
}

// Where the item lives once you have it: enough to build its readable URL
public record LinkTarget
{
    [JsonPropertyName("kind")] public required string Kind { get; set; }
    [JsonPropertyName("id")] public required string Id { get; set; }
    [JsonPropertyName("owner")] public required string Owner { get; set; }

    [JsonPropertyName("slug")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Slug { get; set; }
}

// GET /links/{token}/viewer
public record LinkViewer
{
    [JsonPropertyName("relation")] public required string Relation { get; set; }
    [JsonPropertyName("target")] public required LinkTarget Target { get; set; }

    // The link's stats, for its owner only
    [JsonPropertyName("link")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ShareLink? Link { get; set; }
}

// The track or album a link points at, resolved for the invite screen and access checks
public record LinkItem
{
    public required string Kind { get; init; }
    public required string Id { get; init; }
    public required string Owner { get; init; }
    public required string Name { get; init; }
    public string? Slug { get; init; }
    public string? ImageUrl { get; init; }
    public string? ImageBgColor { get; init; }
    public string? Genre { get; init; }

    // Seconds: the track's length, or the album's total
    public required int Duration { get; init; }

    // The track itself, or the album's tracklist in order
    public required List<LinkItemTrack> Tracks { get; init; }
}

public record LinkItemTrack(string Id, string Name, int Duration);

public record ShareLinkDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI3", AttributeName = "GSI3PK")]
    public required string Gsi3Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI3", AttributeName = "GSI3SK")]
    public required string Gsi3Sk { get; set; }

    [DynamoDBProperty("token")] public required string Token { get; set; }

    [DynamoDBProperty("owner")] public required string Owner { get; set; }

    [DynamoDBProperty("kind")] public required string Kind { get; set; }

    [DynamoDBProperty("targetId")] public required string TargetId { get; set; }

    [DynamoDBProperty("createdAt")] public required long CreatedAt { get; set; }

    // Epoch ms: when the link stops working
    [DynamoDBProperty("linkExpiresAt")] public required long LinkExpiresAt { get; set; }

    // Epoch seconds — the table's TTL attribute: linkExpiresAt + ExpiredGrace
    [DynamoDBProperty("expiresAt")] public required long ExpiresAt { get; set; }

    [DynamoDBProperty("allowPreview")] public required bool AllowPreview { get; set; }

    [DynamoDBProperty("acceptedCount")] public int AcceptedCount { get; set; }

    // Becomes the share's caption when someone accepts
    [DynamoDBProperty("caption")] public string? Caption { get; set; }

    // Epoch ms; set by revoke, removed by restore
    [DynamoDBProperty("revokedAt")] public long? RevokedAt { get; set; }
}
