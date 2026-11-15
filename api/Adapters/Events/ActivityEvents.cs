using System.Globalization;
using Domain;
using Ports.Events;
using Ports.Services;

namespace Adapters.Events;

// The activity feed, derived from the records that cause it: a like, a share or a follow
// being added writes the recipient's row, and being removed deletes it, so the write paths
// never touch activity. Runs off the table's stream (TableEventsLambda) — in order per item,
// at least once — so every action is a put or delete by a key rebuilt from the record
// alone (ActivityItems), which a redelivery repeats harmlessly.
//
//   TRACK#{t} / LIKE#{u}        → TRACK_LIKED to trackOwnerUsername (never a self-like)
//   ALBUM#{a} / LIKE#{u}        → ALBUM_LIKED to albumOwnerUsername (never a self-like)
//   TRACK#{t} / SHARED#{r}      → TRACK_SHARED to r (album grants, SHARED#{r}#ALBUM#…, skipped)
//   ALBUM#{a} / SHARED#{r}      → ALBUM_SHARED to r
//   FOLLOW#{target} / USER#{f}  → USER_FOLLOWED to target
//
// A re-share (a MODIFY with a new sharedAt) replaces the row: the old one goes, the new
// one sits at the top. Shares added from a share link (via = LINK) are the recipient's own
// doing, so they get no row. TTL expiries are ignored.
public sealed class ActivityEvents : ITableChangeHandler
{
    private readonly IDynamoDBService _dynamoDbService;

    public ActivityEvents(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task HandleAsync(TableChange change)
    {
        if (change.IsExpiry)
            return;

        var oldRow = change.Kind == TableChangeKind.Insert ? null : RowFor(change.Keys, change.OldImage);
        var newRow = change.Kind == TableChangeKind.Remove ? null : RowFor(change.Keys, change.NewImage);

        // Unchanged (e.g. a MODIFY that didn't move sharedAt): nothing to do
        if (oldRow is not null && newRow is not null && oldRow.Pk == newRow.Pk && oldRow.Sk == newRow.Sk)
            return;

        if (oldRow is null && newRow is null)
            return;

        var batch = _dynamoDbService.CreateBatchWritePart<ActivityItemDataModel>();
        if (oldRow is not null)
            batch.AddDeleteKey(oldRow.Pk, oldRow.Sk);
        if (newRow is not null)
            batch.AddPutItem(newRow);
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    /// The activity row an item image stands for, or null when it isn't one that makes
    /// activity (or this version of it doesn't — a self-like, a share-link share).
    internal static ActivityItemDataModel? RowFor(IReadOnlyDictionary<string, string> keys,
        IReadOnlyDictionary<string, string>? image)
    {
        if (image is null || !keys.TryGetValue("PK", out var pk) || !keys.TryGetValue("SK", out var sk))
            return null;

        var (kind, id) = Split(pk);
        var (relation, who) = Split(sk);
        var targetType = kind switch
        {
            "TRACK" => FeedItemType.Track,
            "ALBUM" => FeedItemType.Album,
            _ => null,
        };

        if (targetType is not null && relation == "LIKE")
        {
            var owner = Text(image, targetType == FeedItemType.Track ? "trackOwnerUsername" : "albumOwnerUsername");
            if (owner is null || Number(image, "likedAt") is not { } likedAt || owner == who)
                return null;
            return ActivityItems.Build(owner, ActivityItems.LikeSk(likedAt, who, targetType, id),
                targetType == FeedItemType.Track ? ActivityType.TrackLiked : ActivityType.AlbumLiked,
                who, targetType, id, likedAt);
        }

        // SHARED#{recipient} only — SHARED#{recipient}#ALBUM#{id} is an album grant
        if (targetType is not null && relation == "SHARED" && !who.Contains('#'))
        {
            var owner = Text(image, targetType == FeedItemType.Track ? "trackOwnerUsername" : "albumOwnerUsername");
            if (owner is null || Number(image, "sharedAt") is not { } sharedAt || Text(image, "via") == ShareVia.Link)
                return null;
            return ActivityItems.Build(who, ActivityItems.ShareSk(sharedAt, targetType, id),
                targetType == FeedItemType.Track ? ActivityType.TrackShared : ActivityType.AlbumShared,
                owner, targetType, id, sharedAt);
        }

        if (kind == "FOLLOW" && relation == "USER")
        {
            if (Number(image, "createdAt") is not { } followedAt)
                return null;
            return ActivityItems.Build(id, ActivityItems.FollowSk(who, followedAt), ActivityType.UserFollowed,
                who, ActivityTargetType.User, who, followedAt);
        }

        return null;
    }

    // "TRACK#abc" → ("TRACK", "abc"); "SHARED#bob#ALBUM#x" → ("SHARED", "bob#ALBUM#x")
    private static (string Prefix, string Remainder) Split(string key)
    {
        var at = key.IndexOf('#');
        return at < 0 ? (key, "") : (key[..at], key[(at + 1)..]);
    }

    private static string? Text(IReadOnlyDictionary<string, string> image, string name) =>
        image.TryGetValue(name, out var value) && value.Length > 0 ? value : null;

    private static long? Number(IReadOnlyDictionary<string, string> image, string name) =>
        image.TryGetValue(name, out var value) &&
        long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n)
            ? n
            : null;
}
