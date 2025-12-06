namespace Ports;

public interface ITrackSharingService
{
    public Task<bool> IsTrackSharedWithUser(string trackId, string userId);
}