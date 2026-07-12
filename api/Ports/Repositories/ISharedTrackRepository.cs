using Domain;

namespace Ports.Repositories;

public interface ISharedTrackRepository
{
    public Task<bool> IsTrackSharedWithUser(string trackId, string userId);
    public Task<bool> IsTrackSharedWithUserViaAlbum(string trackId, string userId);
    public Task<bool> IsTrackAccessibleToUser(string trackId, string userId);
    public Task<List<string>> GetTrackRecipientsAsync(string trackId);
    public Task ShareTrackAsync(string trackId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients, string? caption);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedWithUser(string userId, int pageSize, string? cursor);
    public Task<PaginatedResult<SharedTrack>> GetTracksSharedFromUser(string senderUserId, string receiverUserId, int pageSize, string? cursor);
}