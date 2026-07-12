using Domain;
using Ports.Services;

namespace Adapters.Repositories;

// Shared join used by playlist/like/album reads: resolve (trackId, ownerUsername) refs
// to full Track objects with one parallel BatchGet of track items + unique owner profiles.
internal static class TrackBatchLookup
{
    public static async Task<Dictionary<string, Track>> GetTracksAsync(
        IDynamoDBService dynamoDbService,
        IReadOnlyCollection<(string TrackId, string OwnerUsername)> trackRefs)
    {
        if (trackRefs.Count == 0)
            return [];

        var trackKeys = trackRefs
            .Select(r => (pk: $"USER#{r.OwnerUsername}", sk: $"TRACK#{r.TrackId}"));

        var ownerKeys = trackRefs
            .Select(r => r.OwnerUsername)
            .Distinct()
            .Select(owner => (pk: $"USER#{owner}", sk: "PROFILE"));

        var tracksTask = dynamoDbService.BatchGetAsync<TrackDataModel>(trackKeys);
        var ownersTask = dynamoDbService.BatchGetAsync<UserDataModel>(ownerKeys);
        await Task.WhenAll(tracksTask, ownersTask);

        var owners = ownersTask.Result.ToDictionary(u => u.Username);

        return tracksTask.Result
            .Where(t => owners.ContainsKey(t.OwnerUsername))
            .ToDictionary(t => t.TrackId, t => MapToTrack(t, owners[t.OwnerUsername]));
    }

    public static Track MapToTrack(TrackDataModel trackDto, UserDataModel ownerDto)
    {
        return new Track
        {
            Id = trackDto.TrackId,
            TrackName = trackDto.TrackName,
            Genre = trackDto.Genre,
            Description = trackDto.Description,
            ImageUrl = trackDto.ImageUrl,
            ImageBgColor = trackDto.ImageBgColor,
            Owner = ownerDto,
            CreatedAt = trackDto.CreatedAt,
            Duration = trackDto.Duration,
            Segments = trackDto.Segments
        };
    }
}
