using Domain;

namespace Ports;

public interface ITrackRepository
{
    public Task<Track?> GetTrackAsync(string trackId);
    public Task<PaginatedResult<Track>> GetTracksByUsername(string username, int pageSize, string? cursor);
}