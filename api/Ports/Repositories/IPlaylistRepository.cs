using Domain;

namespace Ports.Repositories;

public interface IPlaylistRepository
{
    public Task<PaginatedResult<Playlist>> GetPlaylistsAsync(string username, int pageSize, string? cursor);
    public Task<Playlist?> GetPlaylistAsync(string username, string playlistId);
    // playlistId is minted by the handler so the cover image can be processed to its
    // final key before anything is written
    public Task<Playlist> CreatePlaylistAsync(string playlistId, string username, string name, string? description,
        ImageProcessingResult? image);
    public Task<Playlist?> UpdatePlaylistAsync(string username, string playlistId, string? name, string? description,
        ImageProcessingResult? image, bool clearImage);
    public Task DeletePlaylistAsync(string username, string playlistId);
    /// Appends the track at the end of the playlist. Re-adding an existing member
    /// is a no-op (position and addedAt are kept). Returns whether it was added.
    public Task<bool> AddTrackAsync(string username, string playlistId, Track track);
    /// Idempotent. Returns whether the track was a member.
    public Task<bool> RemoveTrackAsync(string username, string playlistId, string trackId);
    /// Declarative save: orderedTrackIds (already lowercased + deduped) become the
    /// playlist in that order — ranks are rewritten, addedAt is preserved, members
    /// missing from the list are removed. Every id must be a current member
    /// (throws ArgumentException otherwise). Returns the number removed.
    public Task<int> SetTracksAsync(string username, string playlistId, IReadOnlyList<string> orderedTrackIds);

    public Task<PaginatedResult<PlaylistTrackEntry>> GetPlaylistTracksAsync(string playlistId, string viewerUsername, int pageSize, string? cursor);
}
