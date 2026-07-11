namespace Ports;

public record AudioProcessingResult(int Segments, int DurationSeconds);

public interface IAudioService
{
    Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId);

    /// Deletes the track's MP3 segments from the private bucket.
    Task DeleteSegmentsAsync(string trackId, int segments);

    /// Presigned GET URLs for the track's MP3 segments in the private bucket, in order.
    Task<List<string>> GetSegmentUrlsAsync(string trackId, int segments, TimeSpan expiry);
}