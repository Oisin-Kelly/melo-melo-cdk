using Domain;

namespace Ports;

public interface ISharedTrackRepository
{
    public Task<bool> IsTrackSharedWithUser(string trackId, string userId);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedWithUser(string userId, int pageSize, string? cursor);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId, int pageSize, string? cursor);
}