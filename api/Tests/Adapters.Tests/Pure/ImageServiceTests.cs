using Adapters.Services;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace Adapters.Tests.Pure;

public class ImageServiceTests
{
    [Fact]
    public void ACoverWithTransparency_IsFlattenedOntoWhite_NotBlack()
    {
        // A transparent image with one opaque red pixel in the middle
        using var image = new Image<Rgba32>(10, 10, new Rgba32(0, 0, 0, 0));
        image[5, 5] = new Rgba32(255, 0, 0, 255);

        ImageService.PrepareCover(image, 10, 10);

        image[0, 0].Should().Be(new Rgba32(255, 255, 255, 255));
        image[5, 5].R.Should().Be(255);
        image[5, 5].A.Should().Be(255);
    }

    [Fact]
    public void ItIsCroppedToTheCoverSize()
    {
        using var image = new Image<Rgba32>(800, 400, new Rgba32(10, 20, 30, 255));
        ImageService.PrepareCover(image, 400, 400);
        (image.Width, image.Height).Should().Be((400, 400));
    }
}
