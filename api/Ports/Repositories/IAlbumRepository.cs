using Domain;

namespace Ports.Repositories;

public interface IAlbumRepository
{
    public Task<PaginatedResult<Album>> GetAlbumsAsync(string ownerUsername, int pageSize, string? cursor);
    public Task<Album?> GetAlbumByIdAsync(string albumId);
    // albumId is minted by the handler so the cover image can be processed to its
    // final key before anything is written
    public Task<Album> CreateAlbumAsync(string albumId, string ownerUsername, string name, string? description,
        ImageProcessingResult? image, IReadOnlyList<string> trackIds);
    public Task<Album?> UpdateAlbumAsync(string ownerUsername, string albumId, string? name, string? description,
        ImageProcessingResult? image, bool clearImage);
    public Task DeleteAlbumAsync(string ownerUsername, string albumId);

    public Task<PaginatedResult<Track>> GetAlbumTracksAsync(string albumId, int pageSize, string? cursor);
    public Task<List<string>> GetAlbumTrackIdsAsync(string albumId);
    public Task AddTracksAsync(string albumId, string ownerUsername, IReadOnlyList<string> trackIds);
    public Task RemoveTracksAsync(string albumId, IReadOnlyList<string> trackIds);
    public Task RemoveTrackFromAllAlbumsAsync(string ownerUsername, string trackId);

    public Task<bool> IsAlbumSharedWithUserAsync(string albumId, string username);
    public Task<List<string>> GetAlbumRecipientsAsync(string albumId);
    public Task ShareAlbumAsync(string albumId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients);
    public Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedWithUserAsync(string username, int pageSize,
        string? cursor);
}
