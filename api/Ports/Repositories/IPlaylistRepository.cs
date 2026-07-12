using Domain;

namespace Ports.Repositories;

public interface IPlaylistRepository
{
    public Task<PaginatedResult<Playlist>> GetPlaylistsAsync(string username, int pageSize, string? cursor);
    public Task<Playlist?> GetPlaylistAsync(string username, string playlistId);
    public Task<Playlist> CreatePlaylistAsync(string username, string name, string? description);
    public Task<Playlist?> UpdatePlaylistAsync(string username, string playlistId, string? name, string? description);
    public Task DeletePlaylistAsync(string username, string playlistId);
    public Task AddTracksAsync(string playlistId, IReadOnlyList<Track> tracks);
    public Task RemoveTracksAsync(string playlistId, IReadOnlyList<string> trackIds);
    public Task<PaginatedResult<Track>> GetPlaylistTracksAsync(string playlistId, int pageSize, string? cursor);
}
