using Domain;

namespace Ports.Repositories;

public interface ILikeRepository
{
    public Task LikeTrackAsync(string trackId, string username, string trackOwnerUsername, int duration);
    public Task UnlikeTrackAsync(string trackId, string username, string trackOwnerUsername);

    // Track-deletion cleanup: drops every like on the track, decrementing each liker's likes playlist
    public Task DeleteLikesForTrackAsync(string trackId);
    public Task<bool> IsTrackLikedByUserAsync(string trackId, string username);
    public Task<PaginatedResult<LikedTrack>> GetLikedTracksAsync(string username, int pageSize, string? cursor);
    public Task<PaginatedResult<TrackLiker>> GetTrackLikersAsync(string trackId, int pageSize, string? cursor);
}
