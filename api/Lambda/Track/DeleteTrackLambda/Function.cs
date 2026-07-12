using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace DeleteTrackLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly IAlbumRepository _albumRepository;
    private readonly IAudioService _audioService;
    private readonly IImageService _imageService;

    public Function(ITrackRepository trackRepository, IAlbumRepository albumRepository,
        IAudioService audioService, IImageService imageService)
    {
        _trackRepository = trackRepository;
        _albumRepository = albumRepository;
        _audioService = audioService;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/tracks/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");
            
            // Direct shares, remaining album grants, likes, upload status, then the Track item

            await _albumRepository.RemoveTrackFromAllAlbumsAsync(username, track.Id);
            await _audioService.DeleteSegmentsAsync(track.Id, track.Segments);

            if (track.ImageUrl is not null)
                await _imageService.DeleteImageAsync($"tracks/{track.Id}/cover_400x400.jpg");

            await _trackRepository.DeleteTrackAsync(username, track.Id);

            return Ok("{\"message\":\"Track deleted.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in DeleteTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
