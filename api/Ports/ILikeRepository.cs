using Domain;

namespace Ports;

public interface ILikeRepository
{
    public Task LikeTrackAsync(string trackId, string username, string trackOwnerUsername);
    public Task UnlikeTrackAsync(string trackId, string username, string trackOwnerUsername);
    public Task<bool> IsTrackLikedByUserAsync(string trackId, string username);
    public Task<PaginatedResult<Track>> GetLikedTracksAsync(string username, int pageSize, string? cursor);
    public Task<PaginatedResult<TrackLiker>> GetTrackLikersAsync(string trackId, int pageSize, string? cursor);
}
