using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

// The kinds of item that get a readable URL (/{owner}/{slug}, /{owner}/albums/{slug},
// /{owner}/playlists/{slug}). Slugs are unique per owner per kind.
public static class SlugKind
{
    public const string Track = "TRACK";
    public const string Album = "ALBUM";
    public const string Playlist = "PLAYLIST";

    // URL path segment ("tracks" | "albums" | "playlists") → kind; null for anything else
    public static string? FromPathSegment(string segment) => segment.ToLowerInvariant() switch
    {
        "tracks" => Track,
        "albums" => Album,
        "playlists" => Playlist,
        _ => null,
    };
}

public static partial class Slugs
{
    public const int MaxLength = 60;

    // Base is cut before a "-N" suffix is added, so the full slug always fits MaxLength
    private const int MaxBaseLength = 50;

    // Track slugs sit directly under the profile (/{owner}/{slug}), so they must never shadow a
    // profile sub-route — current or one a profile might grow. Albums/playlists have their own
    // prefix and need no list. Adding a word later strands any track already using it.
    public static readonly HashSet<string> ReservedTrackSlugs =
    [
        "followers", "following", "albums", "playlists", "tracks", "likes", "liked", "shared",
        "about", "settings", "edit", "activity", "reposts", "sets",
    ];

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();

    [GeneratedRegex("^[a-z0-9]+(-[a-z0-9]+)*$")]
    private static partial Regex SlugFormat();

    // Accented Latin letters → their plain form. An explicit table rather than string.Normalize:
    // the Lambdas run with InvariantGlobalization, where Normalize is a silent no-op ("café" would
    // become "caf"). Mirrored in scripts/backfill-slugs.sh. Anything not here (other scripts,
    // emoji) is dropped like punctuation.
    private static readonly Dictionary<char, string> Folds = BuildFolds(
        ("àáâãäåāăą", "a"), ("çćĉċč", "c"), ("ďđ", "d"), ("èéêëēĕėęě", "e"), ("ĝğġģ", "g"),
        ("ĥħ", "h"), ("ìíîïĩīĭįı", "i"), ("ĵ", "j"), ("ķ", "k"), ("ĺļľŀł", "l"), ("ñńņňŉ", "n"),
        ("òóôõöøōŏő", "o"), ("ŕŗř", "r"), ("śŝşšș", "s"), ("ţťŧț", "t"), ("ùúûüũūŭůűų", "u"),
        ("ŵ", "w"), ("ýÿŷ", "y"), ("źżž", "z"), ("ß", "ss"), ("æ", "ae"), ("œ", "oe"), ("þ", "th"),
        ("ð", "d"));

    private static Dictionary<char, string> BuildFolds(params (string Chars, string Plain)[] groups) =>
        groups.SelectMany(g => g.Chars.Select(c => (c, g.Plain))).ToDictionary(p => p.c, p => p.Plain);

    // "Café del Mar (Live)!" → "cafe-del-mar-live". Falls back to the kind's word ("track") when
    // nothing usable is left (emoji-only or non-Latin titles).
    public static string FromTitle(string title, string kind)
    {
        var lower = title.Trim().ToLowerInvariant();
        var ascii = new StringBuilder(lower.Length);
        foreach (var c in lower)
            ascii.Append(Folds.TryGetValue(c, out var plain) ? plain : c);

        var slug = NonSlugChars().Replace(ascii.ToString(), "-").Trim('-');

        if (slug.Length > MaxBaseLength)
        {
            // Cut at the last word boundary that fits, else hard-cut
            var cut = slug[..MaxBaseLength];
            var lastDash = cut.LastIndexOf('-');
            slug = (lastDash > 0 ? cut[..lastDash] : cut).Trim('-');
        }

        return slug.Length == 0 ? FallbackFor(kind) : slug;
    }

    // The n-th candidate for a base: base, base-2, base-3, …
    public static string Candidate(string baseSlug, int n) => n <= 1 ? baseSlug : $"{baseSlug}-{n}";

    public static bool IsReserved(string slug, string kind) =>
        kind == SlugKind.Track && ReservedTrackSlugs.Contains(slug);

    // A user-typed slug: format + length + not reserved. Returns a user-safe error, or null if fine.
    public static string? Validate(string slug, string kind)
    {
        if (slug.Length is 0 or > MaxLength)
            return $"The URL must be 1–{MaxLength} characters.";
        if (!SlugFormat().IsMatch(slug))
            return "The URL can only use lowercase letters, numbers and single dashes.";
        if (IsReserved(slug, kind))
            return "That URL is reserved. Try another.";
        return null;
    }

    private static string FallbackFor(string kind) => kind switch
    {
        SlugKind.Album => "album",
        SlugKind.Playlist => "playlist",
        _ => "track",
    };
}

// The resolver's answer: the item's id and its canonical slug (differs from the requested one
// when the request came through an old, redirecting slug)
public record ResolvedSlug
{
    [JsonPropertyName("id")] public required string Id { get; set; }
    [JsonPropertyName("slug")] public required string Slug { get; set; }
}

// USER#{owner} / SLUG#{KIND}#{slug} → targetId. The item's canonical slug lives on its meta item
// (`slug`); every other slug record for the same target is an old URL kept as a redirect.
public record SlugDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBProperty("targetId")] public required string TargetId { get; set; }

    [DynamoDBProperty("createdAt")] public required long CreatedAt { get; set; }

    [DynamoDBIgnore]
    public string Slug => Sk[(Sk.IndexOf('#', "SLUG#".Length) + 1)..];
}
