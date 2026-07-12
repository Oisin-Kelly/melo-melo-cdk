using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetTrackLambda;

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
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string trackId)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];
        if (string.IsNullOrWhiteSpace(trackId))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'trackId' is missing", "Bad Request");

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            
            if (track == null)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var isOwner = track.Owner.Username == requestorUsername;

            if (!isOwner && !await _sharedTrackRepository.IsTrackAccessibleToUser(trackId, requestorUsername))
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            track.LikedByMe = await _likeRepository.IsTrackLikedByUserAsync(trackId, requestorUsername);
            if (!isOwner)
                track.LikeCount = null; // like counts are visible to the owner only

            return Ok(
                JsonSerializer.Serialize(
                    track,
                    CustomJsonSerializerContext.Default.Track
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}