using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports;

namespace Adapters;

public class TrackRepository : ITrackRepository
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

    private Task<User?> GetTrackOwner(TrackDataModel trackDto)
    {
        return _userRepository.GetUserByUsername(trackDto.OwnerUsername);
    }
}