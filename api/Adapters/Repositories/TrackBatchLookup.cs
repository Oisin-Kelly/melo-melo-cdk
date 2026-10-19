using Domain;
using Ports.Services;

namespace Adapters.Repositories;

internal static class TrackBatchLookup
{
    public static async Task<Dictionary<string, TrackSummary>> GetTrackSummariesAsync(
        IDynamoDBService dynamoDbService,
        IReadOnlyCollection<(string TrackId, string OwnerUsername)> trackRefs,
        string viewerUsername,
        bool allLiked = false)
    {
        if (trackRefs.Count == 0)
            return [];

        var tracksTask = dynamoDbService.BatchGetAsync<TrackDataModel>(
            trackRefs.Select(r => Keys.Track(r.OwnerUsername, r.TrackId)));
        var ownersTask = ProfileLookup.GetAsync(dynamoDbService, trackRefs.Select(r => r.OwnerUsername));
        var likedTask = allLiked
            ? Task.FromResult(new HashSet<string>(StringComparer.OrdinalIgnoreCase))
            : GetLikedTrackIdsAsync(dynamoDbService, viewerUsername, trackRefs.Select(r => r.TrackId).ToList());
        await Task.WhenAll(tracksTask, ownersTask, likedTask);

        var owners = ownersTask.Result;
        var liked = likedTask.Result;

        return tracksTask.Result
            .Where(t => owners.ContainsKey(t.OwnerUsername))
            .ToDictionary(
                t => t.TrackId,
                t => TrackSummary.From(t, owners[t.OwnerUsername], allLiked || liked.Contains(t.TrackId)));
    }

    // Which of these tracks has the viewer liked
    public static async Task<HashSet<string>> GetLikedTrackIdsAsync(
        IDynamoDBService dynamoDbService,
        string viewerUsername,
        IReadOnlyCollection<string> trackIds)
    {
        if (trackIds.Count == 0)
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var keys = trackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => (pk: $"TRACK#{id}", sk: $"LIKE#{viewerUsername}"));

        var likes = await dynamoDbService.BatchGetAsync<LikeDataModel>(keys);
        return likes.Select(l => l.TrackId).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
