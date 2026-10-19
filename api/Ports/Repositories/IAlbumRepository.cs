using Domain;

namespace Ports.Repositories;

// The album itself (meta item): listing, lookup, create/update, and delete — which tears down the
// tracklist, shares and likes through their own repositories. Tracklist and sharing live in
// IAlbumTracklistRepository / IAlbumShareRepository.
public interface IAlbumRepository
{
    public Task<PaginatedResult<AlbumSummary>> GetAlbumsAsync(string ownerUsername, int pageSize, string? cursor);
    public Task<Album?> GetAlbumByIdAsync(string albumId);
    // albumId is minted by the handler so the cover image can be processed to its
    // final key before anything is written
    public Task<Album> CreateAlbumAsync(string albumId, string ownerUsername, string name, string? description,
        ImageProcessingResult? image, IReadOnlyList<string> trackIds);
    public Task<Album?> UpdateAlbumAsync(string ownerUsername, string albumId, string? name, string? description,
        ImageProcessingResult? image, bool clearImage);
    public Task DeleteAlbumAsync(string ownerUsername, string albumId);
}
