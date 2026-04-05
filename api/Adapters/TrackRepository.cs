using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports;

namespace Adapters;

public sealed class TrackRepository : ITrackRepository
{
    private readonly IDynamoDBService _dynamoDbService;
    private readonly IUserRepository _userRepository;

    public TrackRepository(IDynamoDBService dynamoDbService, IUserRepository userRepository)
    {
        _dynamoDbService = dynamoDbService;
        _userRepository = userRepository;
    }

    public async Task<Track?> GetTrackAsync(string trackId)
    {
        var trackDto = await GetTrackDtoAsync(trackId);
        if (trackDto == null)
            return null;
        
        var owner = await GetTrackOwner(trackDto);
        if (owner == null)
            return null;
        
        return new Track()
        {
            CreatedAt = trackDto.CreatedAt,
            Description = trackDto.Description,
            Duration = trackDto.Duration,
            Genre = trackDto.Genre,
            ImageUrl = trackDto.ImageUrl,
            ImageBgColor = trackDto.ImageBgColor,
            Segments = trackDto.Segments,
            TrackName = trackDto.TrackName,
            Owner = owner,
            Id = trackDto.TrackId,
        };
    }

    private async Task<TrackDataModel?> GetTrackDtoAsync(string trackId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var tracks = await _dynamoDbService.QueryAsync<TrackDataModel>(
            $"TRACK#{normalisedTrackId}",
            "INFO",
            QueryOperator.Equal,
            "GSI1"
        );

        return tracks.FirstOrDefault();
    }

    public async Task<PaginatedResult<Track>> GetTracksByUsername(string username, int pageSize, string? cursor)
    {
        var (trackDtos, nextToken) = await _dynamoDbService.QueryPaginatedAsync<TrackDataModel>(
            hashKey: $"USER#{username}",
            rangeKey: "TRACK#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (trackDtos.Count == 0)
            return new PaginatedResult<Track> { Items = [], NextCursor = null };

        var owner = await _userRepository.GetUserByUsername(username);
        if (owner is null)
            return new PaginatedResult<Track> { Items = [], NextCursor = null };

        var tracks = trackDtos
            .Select(t => new Track
            {
                Id = t.TrackId,
                TrackName = t.TrackName,
                Genre = t.Genre,
                Description = t.Description,
                ImageUrl = t.ImageUrl,
                ImageBgColor = t.ImageBgColor,
                Owner = owner,
                CreatedAt = t.CreatedAt,
                Duration = t.Duration,
                Segments = t.Segments
            })
            .ToList();

        return new PaginatedResult<Track> { Items = tracks, NextCursor = nextToken };
    }

    private Task<User?> GetTrackOwner(TrackDataModel trackDto)
    {
        return _userRepository.GetUserByUsername(trackDto.OwnerUsername);
    }
}