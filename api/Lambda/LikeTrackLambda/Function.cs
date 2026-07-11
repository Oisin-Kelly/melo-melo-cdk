using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace LikeTrackLambda;

public record LikeTrackRequest
{
    [JsonPropertyName("newValue")] public bool? NewValue { get; set; }
}

public record LikeTrackResponse
{
    [JsonPropertyName("newValue")] public required bool NewValue { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly ILikeRepository _likeRepository;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository,
        ILikeRepository likeRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _likeRepository = likeRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/tracks/{trackId}/like")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string trackId, [FromBody] LikeTrackRequest likeRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        if (likeRequest.NewValue == null)
            return Error(HttpStatusCode.BadRequest,
                "The 'newValue' property is required and must be a boolean (true/false).",
                "Bad Request");

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var newValue = likeRequest.NewValue.Value;

            // Liking requires current access to the track; unliking is always allowed
            if (newValue)
            {
                var hasAccess = track.Owner.Username == username ||
                                await _sharedTrackRepository.IsTrackAccessibleToUser(trackId, username);
                if (!hasAccess)
                    return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

                await _likeRepository.LikeTrackAsync(trackId, username, track.Owner.Username);
            }
            else
            {
                await _likeRepository.UnlikeTrackAsync(trackId, username, track.Owner.Username);
            }

            var response = new LikeTrackResponse { NewValue = newValue };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.LikeTrackResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in LikeTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
