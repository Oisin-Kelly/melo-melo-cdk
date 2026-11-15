using Domain;

namespace Ports.Repositories;

public interface ISharedTrackRepository
{
    public Task<bool> IsTrackSharedWithUser(string trackId, string userId);
    /// The user's direct share of the track (when + caption); null without one
    public Task<ShareNote?> GetDirectShareAsync(string trackId, string username);
    public Task<bool> IsTrackSharedWithUserViaAlbum(string trackId, string userId);
    public Task<bool> IsTrackAccessibleToUser(string trackId, string userId);
    public Task<List<string>> GetTrackRecipientsAsync(string trackId);

    public Task<List<Recipient>> GetTrackRecipientDetailsAsync(string trackId);
    /// notifyRecipients: false skips the "shared with you" activity — for someone adding it
    /// themselves from a share link (the feed item is still written)
    public Task ShareTrackAsync(string trackId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients, string? caption, bool notifyRecipients = true);
    public Task RemoveTrackFromLibraryAsync(string trackId, string username);

    // Track-deletion cleanup: every direct share + leftover album grant on the track, and the feed items
    public Task DeleteSharesForTrackAsync(string trackId);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedWithUser(string userId, int pageSize, string? cursor);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId, int pageSize, string? cursor);

    public Task<int> CountTracksSharedFromUser(string senderUserId, string receiverUserId);

    /// Every track the user can play — their own, direct shares, and every track in every
    /// album shared with them — deduped, unpaged (the client's search index). The access
    /// rule (owner OR direct share OR album grant) as a listing.
    public Task<List<TrackSummary>> GetLibraryTracksAsync(string username);
}