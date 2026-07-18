using Domain;

namespace Ports.Repositories;

public interface IAlbumLikeRepository
{
    Task LikeAlbumAsync(string albumId, string username, string albumOwnerUsername);
    Task UnlikeAlbumAsync(string albumId, string username, string albumOwnerUsername);
    Task<bool> IsAlbumLikedByUserAsync(string albumId, string username);
    Task<PaginatedResult<AlbumSummary>> GetLikedAlbumsAsync(string username, int pageSize, string? cursor);
    Task<PaginatedResult<AlbumLiker>> GetAlbumLikersAsync(string albumId, int pageSize, string? cursor);
}
