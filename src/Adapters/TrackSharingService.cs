using Ports;
using Domain;

namespace Adapters;

public class TrackSharingService : ITrackSharingService
{
    private readonly IDynamoDBService _dynamoDbService;

    public TrackSharingService(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<bool> IsTrackSharedWithUser(string trackId, string userId)
    {
        var sharedResult = await _dynamoDbService.GetFromDynamoAsync<SharedTrackDataModel>($"TRACK#{trackId}", $"SHARED#{userId}");

        return sharedResult != null;
    }
}