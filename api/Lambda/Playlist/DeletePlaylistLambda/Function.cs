using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace DeletePlaylistLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;
    private readonly IImageService _imageService;

    public Function(IPlaylistRepository playlistRepository, IImageService imageService)
    {
        _playlistRepository = playlistRepository;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/playlists/{playlistId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var existing = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (existing is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (existing.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest, "the likes playlist cannot be deleted", "Bad Request");

            // Cover first — the meta record goes last inside DeletePlaylistAsync, so a
            // mid-delete crash stays retryable
            if (existing.ImageUrl is not null)
                await _imageService.DeleteImageAsync($"playlists/{existing.Id}/cover_400x400.jpg");

            await _playlistRepository.DeletePlaylistAsync(username, playlistId);

            return Ok("{\"message\":\"Playlist deleted.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in DeletePlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
