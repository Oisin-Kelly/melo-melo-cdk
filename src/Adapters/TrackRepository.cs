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
        };
    }

    private async Task<TrackDataModel?> GetTrackDtoAsync(string trackId)
    {
        var tracks = await _dynamoDbService.QueryByGsiAsync<TrackDataModel>(
            "GSI1",
            $"TRACK#{trackId}",
            "INFO"
        );
        
        return tracks.FirstOrDefault();
    }

    private async Task<User?> GetTrackOwner(TrackDataModel trackDto)
    {
        var ownerUsername = trackDto.Pk.Replace("USER#", "");
        return await _userRepository.GetUserByUsername(ownerUsername);
    }
}