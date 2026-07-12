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

namespace CreatePlaylistLambda;

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
    [HttpApi(LambdaHttpMethod.Post, "/playlists")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        [FromBody] CreatePlaylistRequest createRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            createRequest = _playlistValidationService.ValidateCreate(createRequest);

            // Id is minted here so the cover lands on its final key before any write —
            // a bad image 400s without leaving a half-created playlist behind
            var playlistId = Guid.NewGuid().ToString("N").ToLowerInvariant();

            ImageProcessingResult? image = null;
            if (createRequest.ImageKey is not null)
            {
                image = await _imageService.ProcessImageAsync(
                    createRequest.ImageKey, $"playlists/{playlistId}/cover_400x400.jpg", 400, 400);
            }

            var playlist = await _playlistRepository.CreatePlaylistAsync(
                playlistId, username, createRequest.Name!, createRequest.Description, image);

            return Created(JsonSerializer.Serialize(playlist, CustomJsonSerializerContext.Default.Playlist));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in CreatePlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
