using Domain;

namespace Ports.Repositories;

// Share links (LINK#{token} / META): the gate that lets whoever holds a link become a recipient.
// The share itself is written by ISharedTrackRepository / IAlbumShareRepository as usual.
public interface IShareLinkRepository
{
    public Task<ShareLinkDataModel> CreateAsync(string ownerUsername, string kind, string targetId,
        TimeSpan expiresIn, string? caption = null);

    public Task<ShareLinkDataModel?> GetAsync(string token);

    /// An item's links, newest first (the Share dialog's Links section)
    public Task<List<ShareLinkDataModel>> ListForTargetAsync(string kind, string targetId);

    /// Stops new people joining. Idempotent; people who already accepted keep access.
    public Task RevokeAsync(string token);

    /// Undoes a revoke (the Share dialog's Undo)
    public Task RestoreAsync(string token);

    /// Counts one acceptance, but only while the link is live (not revoked, not expired) —
    /// false means it stopped working, so nothing should be shared. Runs before the share write,
    /// so a revoke or expiry racing an accept wins.
    public Task<bool> TryClaimAsync(string token);

    /// Track/album deletion cleanup: every link to the item
    public Task DeleteLinksForTargetAsync(string kind, string targetId);
}
