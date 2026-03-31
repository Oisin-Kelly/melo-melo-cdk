using Domain;

namespace Ports;

public interface IImageService
{
    public Task<ImageProcessingResult> ProcessImageAsync(
        string imageKey,
        string publicImageKey,
        int width,
        int height);
}