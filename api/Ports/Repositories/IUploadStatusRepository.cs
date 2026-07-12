using Domain;

namespace Ports.Repositories;

public interface IUploadStatusRepository
{
    public Task CreateProcessingAsync(string username, string trackId);
    public Task MarkCompleteAsync(string username, string trackId);
    public Task MarkFailedAsync(string username, string trackId, string reason);
    public Task<UploadStatus?> GetAsync(string username, string trackId);
}
