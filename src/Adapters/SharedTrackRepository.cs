using Amazon.DynamoDBv2.DocumentModel;
using Ports;
using Domain;

namespace Adapters;

public class SharedTrackRepository : ISharedTrackRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public SharedTrackRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<bool> IsTrackSharedWithUser(string trackId, string userId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();
        
        var sharedResult = await _dynamoDbService.GetFromDynamoAsync<SharedTrackDataModel>(
            $"TRACK#{normalisedTrackId}",
            $"SHARED#{userId}"
        );

        return sharedResult != null;
    }

    public async Task<List<SharedTrack>> GetTracksSharedWithUser(string userId)
    {
        var sharedItems = await _dynamoDbService.QueryAsync<SharedTrackDataModel>(
            $"SHARED#{userId}",
            null,
            QueryOperator.Equal,
            "GSI1"
        );

        if (sharedItems.Count == 0)
            return [];

        return await GetSharedTracksFromSharedTrackItems(sharedItems);
    }

    public async Task<List<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId)
    {
        var sharedItems = await _dynamoDbService.QueryAsync<SharedTrackDataModel>(
            $"SHARED#{receiverUserId}",
            $"USER#{senderUserId}",
            QueryOperator.Equal,
            "GSI1"
        );

        if (sharedItems.Count == 0)
            return [];

        return await GetSharedTracksFromSharedTrackItems(sharedItems);
    }

    private async Task<List<SharedTrack>> GetSharedTracksFromSharedTrackItems(List<SharedTrackDataModel> sharedItems)
    {
        var tasks = new List<Task>
        {
            GetBatchTracksAsync(sharedItems),
            GetBatchUniqueOwnersAsync(sharedItems)
        };
        await Task.WhenAll(tasks);

        var tracks = ((Task<List<TrackDataModel>>)tasks[0]).Result.ToDictionary(t => t.Sk);
        var owners = ((Task<List<UserDataModel>>)tasks[1]).Result.ToDictionary(u => u.Pk);

        var sharedTracks = sharedItems
            .Select(share => JoinOnOwnerAndTrack(tracks, owners, share))
            .OfType<SharedTrack>()
            .ToList();

        return sharedTracks;
    }

    private Task<List<TrackDataModel>> GetBatchTracksAsync(List<SharedTrackDataModel> sharedItems)
    {
        var trackKeys = sharedItems
            .Where(item => !string.IsNullOrEmpty(item.Gsi1Sk))
            .Select(item => (pk: item.Gsi1Sk!, sk: item.Pk));

        return _dynamoDbService.BatchGetAsync<TrackDataModel>(trackKeys);
    }

    private Task<List<UserDataModel>> GetBatchUniqueOwnersAsync(
        List<SharedTrackDataModel> sharedItems)
    {
        var trackPks = sharedItems
            .Select(item => item.Gsi1Sk)
            .Where(pk => !string.IsNullOrEmpty(pk))
            .Distinct();

        var userKeys = trackPks
            .Select(pk => (pk: pk!, sk: "PROFILE"));

        return _dynamoDbService.BatchGetAsync<UserDataModel>(userKeys);
    }

    private static SharedTrack? JoinOnOwnerAndTrack(Dictionary<string, TrackDataModel> tracks,
        Dictionary<string, UserDataModel> owners, SharedTrackDataModel shareDetails)
    {
        if (tracks.TryGetValue(shareDetails.Pk, out var track) &&
            owners.TryGetValue(track.Pk, out var owner))
        {
            return new SharedTrack
            {
                SharedAt = shareDetails.SharedAt,
                Caption = shareDetails.Caption,
                Track = MapToTrack(track, owner)
            };
        }

        return null;
    }

    private static Track MapToTrack(TrackDataModel trackDto, UserDataModel ownerDto)
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