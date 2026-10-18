using System.Diagnostics;
using System.Globalization;
using Domain;
using Microsoft.Extensions.DependencyInjection;
using Ports.Services;

namespace Adapters.Services;

public sealed class AudioService : IAudioService
{
    private const string FfmpegPath = "/opt/bin/ffmpeg";
    private const string FfprobePath = "/opt/bin/ffprobe";

    private const int MaxDurationHours = 24;
    private const int MaxDurationSeconds = MaxDurationHours * 3600;

    private readonly IS3Service _dropboxS3Service;
    private readonly IS3Service _privateS3Service;

    public AudioService(
        [FromKeyedServices("Dropbox")] IS3Service dropboxS3Service,
        [FromKeyedServices("Private")] IS3Service privateS3Service
    )
    {
        _dropboxS3Service = dropboxS3Service;
        _privateS3Service = privateS3Service;
    }

    private static string AudioKey(string trackId) => $"processed/{trackId}/audio.m4a";
    private static string OriginalKey(string trackId) => $"processed/{trackId}/original";

    public async Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId)
    {
        var inputPath = $"/tmp/{trackId}.audio";
        var outputPath = $"/tmp/{trackId}.m4a";

        try
        {
            string? sourceContentType;
            using (var response = await _dropboxS3Service.GetObjectResponseAsync(audioKey))
            {
                if (!response.Headers.ContentType?.StartsWith("audio/") ?? true)
                    throw new ArgumentException($"Object '{audioKey}' is not an audio file.");

                sourceContentType = response.Headers.ContentType;

                await using var fileStream = File.Create(inputPath);
                await response.ResponseStream.CopyToAsync(fileStream);
            }

            // Probe before encoding so an over-long file is rejected without
            // paying for the (much slower) ffmpeg re-encode. Some inputs (e.g. raw
            // streams with no container header) report no duration — null here.
            var probedSeconds = await GetDurationAsync(inputPath);
            if (probedSeconds > MaxDurationSeconds)
                throw new ArgumentException($"Audio is longer than the {MaxDurationHours} hour limit.");

            // -vn drops any stray video stream; +faststart moves the seek index to
            // the front so the player can seek anywhere via HTTP range requests
            // without downloading the whole file (critical for long tracks).
            // -t caps the output just past the limit, so an input whose length the
            // probe couldn't read still can't sneak past it (checked below).
            await RunProcessAsync(FfmpegPath, [
                "-i", inputPath,
                "-vn",
                "-t", (MaxDurationSeconds + 1).ToString(CultureInfo.InvariantCulture),
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                outputPath
            ]);

            // The encoded m4a always carries a duration, so fall back to it
            var durationSeconds = probedSeconds
                ?? await GetDurationAsync(outputPath)
                ?? throw new ArgumentException("Couldn't determine the length of this audio file.");
            if (durationSeconds > MaxDurationSeconds)
                throw new ArgumentException($"Audio is longer than the {MaxDurationHours} hour limit.");

            await using (var fileStream = File.OpenRead(outputPath))
                await _privateS3Service.PutObjectAsync(fileStream, AudioKey(trackId));

            // Archived after a successful encode (not before the duration check) so a rejected
            // over-long upload never leaves an orphaned original behind.
            await using (var originalStream = File.OpenRead(inputPath))
                await _privateS3Service.PutObjectAsync(originalStream, OriginalKey(trackId), sourceContentType);

            return new AudioProcessingResult(durationSeconds);
        }
        finally
        {
            if (File.Exists(inputPath)) File.Delete(inputPath);
            if (File.Exists(outputPath)) File.Delete(outputPath);
        }
    }

    public Task DeleteAudioAsync(string trackId)
    {
        return Task.WhenAll(
            _privateS3Service.DeleteObjectAsync(AudioKey(trackId)),
            _privateS3Service.DeleteObjectAsync(OriginalKey(trackId)));
    }

    public Task<string> GetStreamUrlAsync(string trackId, TimeSpan expiry)
    {
        return _privateS3Service.GetPresignedGetUrlAsync(AudioKey(trackId), expiry);
    }

    // Whole seconds, or null when ffprobe can't tell ("N/A" / empty) — never 0 for unknown,
    // which would read as a zero-length track and skip the duration limit
    private static async Task<int?> GetDurationAsync(string inputPath)
    {
        var output = await RunProcessAsync(FfprobePath, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputPath
        ]);

        return double.TryParse(output.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
            ? (int)d
            : null;
    }

    private static async Task<string> RunProcessAsync(string executable, string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = executable,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var arg in args) psi.ArgumentList.Add(arg);

        using var process = Process.Start(psi)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
            throw new Exception($"{executable} failed (exit {process.ExitCode}): {await stderr}");

        return await stdout;
    }
}
