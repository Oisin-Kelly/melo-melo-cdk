using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace GetOriginalTrackLambda;

public record OriginalTrackResponse
{
    [JsonPropertyName("url")] public required string Url { get; set; }
    [JsonPropertyName("fileName")] public required string FileName { get; set; }
    [JsonPropertyName("contentType")] public string? ContentType { get; set; }
    [JsonPropertyName("expiresAt")] public required long ExpiresAt { get; set; }
}

// The track's original upload, exactly as uploaded (format included), for its owner to download:
// a short-lived presigned URL that S3 serves as an attachment named "{track name}.{ext}".
// Owner-only — anyone else gets the same 404 as a missing track.
public sealed class Function : BaseLambdaFunctionHandler
{
    // The browser starts the download as soon as it has the URL
    private static readonly TimeSpan UrlExpiry = TimeSpan.FromMinutes(5);

    public const string NotAvailableMessage = "The original file isn't available for this track";

    private readonly ITrackRepository _trackRepository;
    private readonly IAudioService _audioService;

    public Function(ITrackRepository trackRepository, IAudioService audioService)
    {
        _trackRepository = trackRepository;
        _audioService = audioService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}/original")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            // Tracks processed before originals were archived have none
            var download = await _audioService.GetOriginalDownloadAsync(track.Id, track.TrackName, UrlExpiry);
            if (download is null)
                return Error(HttpStatusCode.NotFound, NotAvailableMessage, "Not Found");

            var response = new OriginalTrackResponse
            {
                Url = download.Url,
                FileName = download.FileName,
                ContentType = download.ContentType,
                ExpiresAt = DateTimeOffset.UtcNow.Add(UrlExpiry).ToUnixTimeMilliseconds(),
            };
            return Ok(JsonSerializer.Serialize(response, GetOriginalTrackJsonContext.Default.OriginalTrackResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetOriginalTrackLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
