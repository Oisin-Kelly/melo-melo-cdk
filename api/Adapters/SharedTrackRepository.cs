using Amazon.DynamoDBv2.DocumentModel;
using Ports;
using Domain;

namespace Adapters;

public sealed class SharedTrackRepository : ISharedTrackRepository
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

    public async Task<PaginatedResult<SharedTrack>> GetTracksSharedWithUser(string userId, int pageSize, string? cursor)
    {
        var (sharedItems, nextToken) = await _dynamoDbService.QueryPaginatedAsync<SharedTrackDataModel>(
            hashKey: $"SHARED#{userId}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (sharedItems.Count == 0)
            return new PaginatedResult<SharedTrack> { Items = [], NextCursor = null };

        var items = await GetSharedTracksFromSharedTrackItems(sharedItems);
        return new PaginatedResult<SharedTrack> { Items = items, NextCursor = nextToken };
    }

    public async Task<PaginatedResult<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId, int pageSize, string? cursor)
    {
        var (sharedItems, nextToken) = await _dynamoDbService.QueryPaginatedAsync<SharedTrackDataModel>(
            hashKey: $"SHARED#{receiverUserId}",
            rangeKey: $"SENDER#{senderUserId}#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI2",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (sharedItems.Count == 0)
            return new PaginatedResult<SharedTrack> { Items = [], NextCursor = null };

        var items = await GetSharedTracksFromSharedTrackItems(sharedItems);
        return new PaginatedResult<SharedTrack> { Items = items, NextCursor = nextToken };
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

        return sharedItems
            .Select(share => JoinOnOwnerAndTrack(tracks, owners, share))
            .OfType<SharedTrack>()
            .ToList();
    }

    private Task<List<TrackDataModel>> GetBatchTracksAsync(List<SharedTrackDataModel> sharedItems)
    {
        var trackKeys = sharedItems
            .Where(item => !string.IsNullOrEmpty(item.TrackOwnerUsername))
            .Select(item => (pk: $"USER#{item.TrackOwnerUsername}", sk: item.Pk));

        return _dynamoDbService.BatchGetAsync<TrackDataModel>(trackKeys);
    }

    private Task<List<UserDataModel>> GetBatchUniqueOwnersAsync(List<SharedTrackDataModel> sharedItems)
    {
        var userKeys = sharedItems
            .Select(item => item.TrackOwnerUsername)
            .Where(owner => !string.IsNullOrEmpty(owner))
            .Distinct()
            .Select(owner => (pk: $"USER#{owner}", sk: "PROFILE"));

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
