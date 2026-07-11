using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetTrackSegmentsLambda;

public record TrackSegmentsResponse
{
    [JsonPropertyName("urls")] public required List<string> Urls { get; set; }
    [JsonPropertyName("expiresAt")] public required long ExpiresAt { get; set; }
    [JsonPropertyName("duration")] public required int Duration { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    // Short-lived on purpose: presigned URLs leak into logs and browser history,
    // and re-fetching them is one cheap call
    private static readonly TimeSpan UrlExpiry = TimeSpan.FromHours(1);

    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IAudioService _audioService;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository,
        IAudioService audioService)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _audioService = audioService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}/segments")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            // The single track-access rule: owner OR direct share OR album grant
            var hasAccess = track.Owner.Username == username ||
                            await _sharedTrackRepository.IsTrackAccessibleToUser(track.Id, username);
            if (!hasAccess)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var urls = await _audioService.GetSegmentUrlsAsync(track.Id, track.Segments, UrlExpiry);

            var response = new TrackSegmentsResponse
            {
                Urls = urls,
                ExpiresAt = DateTimeOffset.UtcNow.Add(UrlExpiry).ToUnixTimeMilliseconds(),
                Duration = track.Duration,
            };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.TrackSegmentsResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackSegmentsLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
