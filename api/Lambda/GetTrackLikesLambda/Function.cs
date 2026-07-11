using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports;

namespace GetTrackLikesLambda;

public record TrackLikesResponse
{
    [JsonPropertyName("likeCount")] public required int LikeCount { get; set; }
    [JsonPropertyName("items")] public required List<TrackLiker> Items { get; set; }
    [JsonPropertyName("nextCursor")] public string? NextCursor { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 25;

    private readonly ITrackRepository _trackRepository;
    private readonly ILikeRepository _likeRepository;

    public Function(ITrackRepository trackRepository, ILikeRepository likeRepository)
    {
        _trackRepository = trackRepository;
        _likeRepository = likeRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}/likes")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string trackId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);

            // Likes are visible to the track owner only
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var likers = await _likeRepository.GetTrackLikersAsync(trackId, PageSize, cursor);

            var response = new TrackLikesResponse
            {
                LikeCount = track.LikeCount ?? 0,
                Items = likers.Items,
                NextCursor = likers.NextCursor,
            };

            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.TrackLikesResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackLikesLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
