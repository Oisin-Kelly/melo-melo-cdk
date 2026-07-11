using System.Diagnostics;
using Domain;
using Microsoft.Extensions.DependencyInjection;
using Ports;

namespace Adapters;

public sealed class AudioService : IAudioService
{
    private const string FfmpegPath = "/opt/bin/ffmpeg";
    private const string FfprobePath = "/opt/bin/ffprobe";

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

    public async Task<AudioProcessingResult> ProcessAudioAsync(string audioKey, string trackId)
    {
        var inputPath = $"/tmp/{trackId}.audio";
        var outputDir = $"/tmp/{trackId}";

        try
        {
            using (var response = await _dropboxS3Service.GetObjectResponseAsync(audioKey))
            {
                if (!response.Headers.ContentType?.StartsWith("audio/") ?? true)
                    throw new ArgumentException($"Object '{audioKey}' is not an audio file.");

                await using var fileStream = File.Create(inputPath);
                await response.ResponseStream.CopyToAsync(fileStream);
            }

            Directory.CreateDirectory(outputDir);

            var durationTask = GetDurationAsync(inputPath);
            var segmentTask = RunProcessAsync(FfmpegPath, [
                "-i", inputPath,
                "-f", "segment",
                "-segment_time", "20",
                "-codec:a", "libmp3lame",
                "-b:a", "192k",
                $"{outputDir}/segment_%d.mp3"
            ]);

            await Task.WhenAll(durationTask, segmentTask);
            var durationSeconds = await durationTask;

            var segments = Directory.GetFiles(outputDir, "segment_*.mp3")
                .OrderBy(ExtractSegmentIndex)
                .ToList();

            await Task.WhenAll(segments.Select(async (segmentPath, i) =>
            {
                await using var fileStream = File.OpenRead(segmentPath);
                await _privateS3Service.PutObjectAsync(fileStream, $"processed/{trackId}/segment_{i}.mp3");
            }));

            return new AudioProcessingResult(segments.Count, durationSeconds);
        }
        finally
        {
            if (File.Exists(inputPath)) File.Delete(inputPath);
            if (Directory.Exists(outputDir)) Directory.Delete(outputDir, recursive: true);
        }
    }

    public Task DeleteSegmentsAsync(string trackId, int segments)
    {
        return Task.WhenAll(Enumerable.Range(0, segments)
            .Select(i => _privateS3Service.DeleteObjectAsync($"processed/{trackId}/segment_{i}.mp3")));
    }

    public async Task<List<string>> GetSegmentUrlsAsync(string trackId, int segments, TimeSpan expiry)
    {
        var urls = await Task.WhenAll(Enumerable.Range(0, segments)
            .Select(i => _privateS3Service.GetPresignedGetUrlAsync(
                $"processed/{trackId}/segment_{i}.mp3", expiry)));

        return urls.ToList();
    }

    private static async Task<int> GetDurationAsync(string inputPath)
    {
        var output = await RunProcessAsync(FfprobePath, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            inputPath
        ]);

        return double.TryParse(output.Trim(), out var d) ? (int)d : 0;
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

    private static int ExtractSegmentIndex(string path)
    {
        var name = Path.GetFileNameWithoutExtension(path);
        return int.TryParse(name.Split('_').Last(), out var i) ? i : 0;
    }
}
