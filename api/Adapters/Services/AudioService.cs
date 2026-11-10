using System.Diagnostics;
using System.Globalization;
using System.Net;
using Amazon.S3;
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
    private static string PreviewKey(string trackId) => $"processed/{trackId}/preview.m4a";

    public async Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId)
    {
        var inputPath = $"/tmp/{trackId}.audio";
        var outputPath = $"/tmp/{trackId}.m4a";
        var previewPath = $"/tmp/{trackId}.preview.m4a";

        try
        {
            string? sourceContentType;
            using (var response = await _dropboxS3Service.GetObjectResponseAsync(audioKey))
            {
                // Kept as the archived original's Content-Type, which names its download
                sourceContentType = OriginalDownloads.AudioContentType(response.Headers.ContentType, audioKey)
                    ?? throw new ArgumentException($"Object '{audioKey}' is not an audio file.");

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

            if (durationSeconds > ShareLinks.PreviewClipSeconds)
                await CutPreviewAsync(outputPath, previewPath, durationSeconds, trackId);

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
            if (File.Exists(previewPath)) File.Delete(previewPath);
        }
    }

    // The 30s clip a share link plays before someone adds the track: from the encoded audio,
    // starting 30s in (or a quarter of the way through when that's earlier, so short tracks
    // don't start near the end — and never so late that a full 30s doesn't fit), with a 1s
    // fade at each end. Only for tracks over 30s — shorter ones play in full.
    private async Task CutPreviewAsync(string encodedPath, string previewPath, int durationSeconds,
        string trackId)
    {
        var clip = ShareLinks.PreviewClipSeconds;
        var start = Math.Max(0, Math.Min(Math.Min(30, durationSeconds / 4), durationSeconds - clip));
        await RunProcessAsync(FfmpegPath, [
            "-ss", start.ToString(CultureInfo.InvariantCulture),
            "-t", clip.ToString(CultureInfo.InvariantCulture),
            "-i", encodedPath,
            "-vn",
            "-af", $"afade=t=in:d=1,afade=t=out:st={clip - 1}:d=1",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            "-y",
            previewPath
        ]);

        await using (var previewStream = File.OpenRead(previewPath))
            await _privateS3Service.PutObjectAsync(previewStream, PreviewKey(trackId), "audio/mp4");
    }

    public async Task<LinkPreviewAudio> GetPreviewAsync(LinkItemTrack track, TimeSpan expiry)
    {
        var isFullTrack = track.Duration <= ShareLinks.PreviewClipSeconds;

        var key = isFullTrack ? AudioKey(track.Id) : PreviewKey(track.Id);
        return new LinkPreviewAudio
        {
            Url = await _privateS3Service.GetPresignedGetUrlAsync(key, expiry),
            IsFullTrack = isFullTrack,
        };
    }

    public Task DeleteAudioAsync(string trackId)
    {
        return Task.WhenAll(
            _privateS3Service.DeleteObjectAsync(AudioKey(trackId)),
            _privateS3Service.DeleteObjectAsync(OriginalKey(trackId)),
            _privateS3Service.DeleteObjectAsync(PreviewKey(trackId)));
    }

    public Task<string> GetStreamUrlAsync(string trackId, TimeSpan expiry)
    {
        // The player reuses one URL per track for its lifetime, so the browser may keep the
        // bytes it already fetched for that long (a replay or a step back needn't re-download)
        return _privateS3Service.GetPresignedGetUrlAsync(AudioKey(trackId), expiry,
            $"private, max-age={(int)expiry.TotalSeconds}");
    }

    public async Task<OriginalDownload?> GetOriginalDownloadAsync(string trackId, string trackName, TimeSpan expiry)
    {
        string? contentType;
        try
        {
            var metadata = await _privateS3Service.GetObjectMetadata(OriginalKey(trackId));
            contentType = metadata.Headers.ContentType;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        var fileName = OriginalDownloads.FileName(trackName, contentType);
        var url = await _privateS3Service.GetPresignedDownloadUrlAsync(
            OriginalKey(trackId), expiry, OriginalDownloads.ContentDisposition(fileName));
        return new OriginalDownload(url, fileName, contentType);
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
