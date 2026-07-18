using Domain;

namespace Ports.Repositories;

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

    public Task<PaginatedResult<TrackSummary>> GetAlbumTracksAsync(string albumId, string viewerUsername, int pageSize, string? cursor);
    public Task<List<string>> GetAlbumTrackIdsAsync(string albumId);
    /// Declarative save: orderedTrackIds (already validated — lowercased, deduped,
    /// owner's own tracks, within the cap) become the tracklist in that order. New
    /// ids fan out grants to existing recipients, dropped members have their
    /// album-derived grants revoked, kept members are re-ranked only. Returns the
    /// number of tracks added and removed.
    public Task<(int Added, int Removed)> SetTracksAsync(string albumId, string ownerUsername,
        IReadOnlyList<string> orderedTrackIds);

    public Task RemoveTrackFromAllAlbumsAsync(string ownerUsername, string trackId);

    public Task<bool> IsAlbumSharedWithUserAsync(string albumId, string username);
    public Task<List<string>> GetAlbumRecipientsAsync(string albumId);

    /// Recipients with hydrated profiles, newest share first (≤50 by the share limit)
    public Task<List<Recipient>> GetAlbumRecipientDetailsAsync(string albumId);
    public Task ShareAlbumAsync(string albumId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients);
    public Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedWithUserAsync(string username, int pageSize,
        string? cursor);
}
