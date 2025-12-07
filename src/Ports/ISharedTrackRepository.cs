using Domain;

namespace Ports;

public interface ISharedTrackRepository
{
    public Task<bool> IsTrackSharedWithUser(string trackId, string userId);
    public Task<List<SharedTrack>> GetTracksSharedWithUser(string userId);
    public Task<List<SharedTrack>> GetTracksSharedFromUser(string userId, string receiverUserId);
}