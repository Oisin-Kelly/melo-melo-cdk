using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;
using Ports.Validation;

namespace UpdatePlaylistLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;
    private readonly IPlaylistValidationService _playlistValidationService;
    private readonly IImageService _imageService;

    public Function(IPlaylistRepository playlistRepository, IPlaylistValidationService playlistValidationService,
        IImageService imageService)
    {
        _playlistRepository = playlistRepository;
        _playlistValidationService = playlistValidationService;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/playlists/{playlistId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId,
        [FromBody] UpdatePlaylistRequest updateRequest)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var existing = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (existing is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (existing.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest, "the likes playlist cannot be modified", "Bad Request");

            updateRequest = _playlistValidationService.ValidateUpdate(updateRequest);

            ImageProcessingResult? image = null;
            if (updateRequest.ImageKey is not null)
            {
                image = await _imageService.ProcessImageAsync(
                    updateRequest.ImageKey, $"playlists/{existing.Id}/cover_400x400.jpg", 400, 400);
            }

            var updated = await _playlistRepository.UpdatePlaylistAsync(
                username, playlistId, updateRequest.Name, updateRequest.Description,
                image, updateRequest.ClearedImage);

            return Ok(JsonSerializer.Serialize(updated, CustomJsonSerializerContext.Default.Playlist));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdatePlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
