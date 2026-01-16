using Domain;
using Microsoft.Extensions.DependencyInjection;
using Ports;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Adapters;

public class ImageService : IImageService
{
    private readonly IS3Service _dropboxS3Service;
    private readonly IS3Service _publicS3Service;

    public ImageService(
        [FromKeyedServices("Dropbox")] IS3Service dropboxS3Service,
        [FromKeyedServices("Public")] IS3Service publicS3Service
    )
    {
       _dropboxS3Service = dropboxS3Service;
       _publicS3Service = publicS3Service;
    }

    public async Task<ImageProcessingResult> ProcessImageAsync(
        string imageKey,
        string publicImageKey,
        int width,
        int height)
    {
        var metadata = await _dropboxS3Service.GetObjectMetadata(imageKey);
        if (!metadata.Headers.ContentType?.StartsWith("image/") ?? true)
        {
            throw new ArgumentException($"Object '{imageKey}' is not an image.");
        }

        using var response = await _dropboxS3Service.GetObjectResponseAsync(imageKey);
        using var image = await Image.LoadAsync<Rgba32>(response.ResponseStream);

        image.Mutate(x =>
        {
            x.AutoOrient();
            x.Resize(new ResizeOptions
            {
                Size = new Size(width, height),
                Mode = ResizeMode.Crop,
                Sampler = KnownResamplers.Lanczos3
            });
        });

        using var outputStream = new MemoryStream();
        await image.SaveAsJpegAsync(outputStream);

        var url = await _publicS3Service.PutObjectAsync(outputStream, publicImageKey);
        var imageHex = GetDominantColor(image);

        return new ImageProcessingResult(imageHex, url);
    }

    private static string GetDominantColor(Image<Rgba32> image)
    {
        var colorThief = new ColorThief.ImageSharp.ColorThief();
        var quantizedColor = colorThief.GetColor(image);

        return $"#{quantizedColor.Color.R:X2}{quantizedColor.Color.G:X2}{quantizedColor.Color.B:X2}";
    }
}