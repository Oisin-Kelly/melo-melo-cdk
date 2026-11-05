using Domain;

namespace Adapters.Tests.Pure;

public class OriginalDownloadsTests
{
    [Theory]
    [InlineData("audio/mpeg", "mp3")]
    [InlineData("audio/wav", "wav")]
    [InlineData("audio/x-wav", "wav")]
    [InlineData("audio/wave", "wav")]
    [InlineData("audio/flac", "flac")]
    [InlineData("audio/x-m4a", "m4a")]
    [InlineData("audio/mp4", "m4a")]
    [InlineData("audio/aac", "aac")]
    [InlineData("audio/ogg", "ogg")]
    [InlineData("audio/aiff", "aiff")]
    [InlineData("AUDIO/MPEG", "mp3")]
    [InlineData("audio/ogg; codecs=opus", "ogg")]
    public void ExtensionFor_KnownAudioTypes(string contentType, string extension)
    {
        OriginalDownloads.ExtensionFor(contentType).Should().Be(extension);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("application/octet-stream")]
    [InlineData("audio/made-up")]
    public void ExtensionFor_UnknownTypes_IsNull(string? contentType)
    {
        OriginalDownloads.ExtensionFor(contentType).Should().BeNull();
    }

    [Theory]
    [InlineData("audio/mpeg", "alice/tracks/a.mp3", "audio/mpeg")]
    [InlineData("audio/x-wav", "alice/tracks/a.wav", "audio/x-wav")] // a known type is kept as sent
    [InlineData("application/octet-stream", "alice/tracks/a.flac", "audio/flac")]
    [InlineData("application/octet-stream", "alice/tracks/a.AIF", "audio/aiff")]
    [InlineData(null, "alice/tracks/a.mp3", "audio/mpeg")]
    [InlineData("audio/made-up", "alice/tracks/a.ogg", "audio/ogg")] // unnameable type, known extension
    [InlineData("audio/made-up", "alice/tracks/a.bin", "audio/made-up")] // still audio, just no download extension
    public void AudioContentType_FallsBackToTheFileExtension(string? uploadedType, string key, string expected)
    {
        OriginalDownloads.AudioContentType(uploadedType, key).Should().Be(expected);
    }

    [Theory]
    [InlineData("image/jpeg", "alice/tracks/a.jpg")]
    [InlineData("application/octet-stream", "alice/tracks/a.bin")]
    [InlineData("application/octet-stream", "alice/tracks.flac/noextension")] // a dot in a folder isn't an extension
    [InlineData("application/pdf", "alice/tracks/a.pdf")]
    public void AudioContentType_NotAudio_IsNull(string? uploadedType, string key)
    {
        OriginalDownloads.AudioContentType(uploadedType, key).Should().BeNull();
    }

    [Theory]
    [InlineData("My Song", "audio/mpeg", "My Song.mp3")]
    [InlineData("Café del Mar", "audio/wav", "Café del Mar.wav")]
    [InlineData("AC/DC: \"Live?\" <b>", "audio/flac", "AC DC Live b.flac")]
    [InlineData("  Two   spaces  ", "audio/mpeg", "Two spaces.mp3")]
    [InlineData("Ends with dots...", "audio/mpeg", "Ends with dots.mp3")]
    [InlineData("", "audio/wav", "track.wav")]
    [InlineData("///", "audio/wav", "track.wav")]
    [InlineData("No type", null, "No type")]
    public void FileName_IsTheTrackNameMadeSafe_PlusTheExtension(string name, string? contentType, string expected)
    {
        OriginalDownloads.FileName(name, contentType).Should().Be(expected);
    }

    [Fact]
    public void FileName_CapsLongNames_BeforeTheExtension()
    {
        var fileName = OriginalDownloads.FileName(new string('x', 300), "audio/mpeg");

        fileName.Should().Be(new string('x', 100) + ".mp3");
    }

    [Fact]
    public void ContentDisposition_IsAnAttachment_WithAnAsciiFallbackAndTheExactUtf8Name()
    {
        OriginalDownloads.ContentDisposition("Café del Mar.wav").Should()
            .Be("attachment; filename=\"Caf_ del Mar.wav\"; filename*=UTF-8''Caf%C3%A9%20del%20Mar.wav");
    }

    [Fact]
    public void ContentDisposition_PlainNamesAreUnchanged()
    {
        OriginalDownloads.ContentDisposition("My-Song_1.mp3").Should()
            .Be("attachment; filename=\"My-Song_1.mp3\"; filename*=UTF-8''My-Song_1.mp3");
    }
}
