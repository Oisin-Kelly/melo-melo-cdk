using Domain;

namespace Ports.Repositories;

public interface IUploadStatusRepository
{
    public Task CreateProcessingAsync(string username, string trackId, string name);
    public Task MarkCompleteAsync(string username, string trackId);
    public Task MarkFailedAsync(string username, string trackId, string reason);
    public Task<UploadStatus?> GetAsync(string username, string trackId);
    /// The uploader's unfinished uploads — PROCESSING or FAILED — newest first.
    public Task<List<UploadStatus>> GetUnfinishedAsync(string username);
    /// Drops a finished or failed upload's record; false (nothing removed) while it's still processing.
    public Task<bool> DismissAsync(string username, string trackId);
    public Task DeleteAsync(string username, string trackId);
}
