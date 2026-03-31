using Domain;

namespace Ports;

public interface ITrackRepository
{
    public Task<Track?> GetTrackAsync(string trackId);
}