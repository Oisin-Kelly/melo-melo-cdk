using Amazon.Lambda.Annotations;
using Amazon.Lambda.Core;
using Domain;
using Ports;

namespace ProcessTrackLambda;

public sealed class Function
{
    private readonly ITrackRepository _trackRepository;
    private readonly IAudioService _audioService;
    private readonly IImageService _imageService;
    private readonly IUploadStatusRepository _uploadStatusRepository;

    public Function(ITrackRepository trackRepository, IAudioService audioService, IImageService imageService,
        IUploadStatusRepository uploadStatusRepository)
    {
        _trackRepository = trackRepository;
        _audioService = audioService;
        _imageService = imageService;
        _uploadStatusRepository = uploadStatusRepository;
    }

    [LambdaFunction]
    public async Task<ProcessTrackOutput> FunctionHandler(ProcessTrackInput input, ILambdaContext context)
    {
        // TrackId is minted by UploadTrackLambda; fall back for in-flight legacy executions
        var trackId = input.TrackId ?? Guid.NewGuid().ToString("N").ToLowerInvariant();

        try
        {
            var imageTask = ProcessImageAsync(input.ImageKey, trackId);
            var audioTask = _audioService.ProcessAudioAsync(input.AudioKey!, trackId);
            await Task.WhenAll(imageTask, audioTask);

            await _trackRepository.CreateTrackAsync(trackId, input, await audioTask, await imageTask);
            await _uploadStatusRepository.MarkCompleteAsync(input.Username, trackId);

            context.Logger.LogLine($"Track {trackId} created for user {input.Username}.");

            return new ProcessTrackOutput { TrackId = trackId, Success = true };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error processing track for user {input.Username}: {ex.Message}");

            // ArgumentException carries a user-safe reason ("not an audio file");
            // anything else stays generic so ffmpeg stderr never reaches clients
            var reason = ex is ArgumentException ? ex.Message : "Audio processing failed.";
            await _uploadStatusRepository.MarkFailedAsync(input.Username, trackId, reason);

            throw;
        }
    }

    private async Task<ImageProcessingResult?> ProcessImageAsync(string? imageKey, string trackId)
    {
        if (imageKey is null) return null;

        return await _imageService.ProcessImageAsync(
            imageKey,
            $"tracks/{trackId}/cover_400x400.jpg",
            400,
            400
        );
    }
}
