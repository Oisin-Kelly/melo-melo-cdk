namespace Ports.Services;

public record AudioProcessingResult(int DurationSeconds);

public interface IAudioService
{
    Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId);

    Task DeleteAudioAsync(string trackId);

    Task<string> GetStreamUrlAsync(string trackId, TimeSpan expiry);
}