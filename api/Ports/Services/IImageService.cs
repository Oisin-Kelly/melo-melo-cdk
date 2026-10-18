using Domain;

namespace Ports.Services;

public interface IImageService
{
    // imageKey must be a dropbox key staged by ownerUsername (see DropboxKeys)
    public Task<ImageProcessingResult> ProcessImageAsync(
        string ownerUsername,
        string imageKey,
        string publicImageKey,
        int width,
        int height);
    public Task DeleteImageAsync(string publicImageKey);
}