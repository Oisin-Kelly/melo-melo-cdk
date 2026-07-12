using Domain;

namespace Ports.Services;

public interface IImageService
{
    public Task<ImageProcessingResult> ProcessImageAsync(
        string imageKey,
        string publicImageKey,
        int width,
        int height);
    public Task DeleteImageAsync(string publicImageKey);
}