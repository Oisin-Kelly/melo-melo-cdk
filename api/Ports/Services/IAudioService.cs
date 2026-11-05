using Domain;

namespace Ports.Services;

public record AudioProcessingResult(int DurationSeconds);

public interface IAudioService
{
    Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId);

    Task DeleteAudioAsync(string trackId);

    Task<string> GetStreamUrlAsync(string trackId, TimeSpan expiry);

    // A download of the archived original upload, named after the track; null when the track
    // has no archived original (processed before originals were kept)
    Task<OriginalDownload?> GetOriginalDownloadAsync(string trackId, string trackName, TimeSpan expiry);

    // What a share link's invite screen can play: the whole track when it's 30s or shorter, else
    // its 30s preview clip (cut during processing)
    Task<LinkPreviewAudio> GetPreviewAsync(LinkItemTrack track, TimeSpan expiry);
}