using Domain;

namespace Ports.Repositories;

// Who an album is shared with: share records, the per-track grants they imply, feed + activity
// items, and the recipient-side views (shared-with-me, remove-from-library).
public interface IAlbumShareRepository
{
    public Task<bool> IsAlbumSharedWithUserAsync(string albumId, string username);
    public Task<List<string>> GetAlbumRecipientsAsync(string albumId);

    /// Recipients with hydrated profiles, newest share first (≤50 by the share limit)
    public Task<List<Recipient>> GetAlbumRecipientDetailsAsync(string albumId);
    /// notifyRecipients: false skips the "shared with you" activity (accepting a share link)
    public Task ShareAlbumAsync(string albumId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients, string? caption, bool notifyRecipients = true);
    public Task RemoveAlbumFromLibraryAsync(string albumId, string username);
    public Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedWithUserAsync(string username, int pageSize,
        string? cursor);

    /// Albums one sender shared with the viewer, newest first (a profile's "shared with you" row)
    public Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedFromUserAsync(string senderUsername,
        string viewerUsername, int pageSize, string? cursor);

    // Album-deletion cleanup, run first: revokes every recipient's grants, then the shares + feed items
    public Task DeleteAllSharesAsync(string albumId);
}
