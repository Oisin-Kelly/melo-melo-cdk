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

namespace CreateAlbumLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;
    private readonly ITrackRepository _trackRepository;
    private readonly IAlbumValidationService _albumValidationService;
    private readonly IImageService _imageService;

    public Function(IAlbumRepository albumRepository, ITrackRepository trackRepository,
        IAlbumValidationService albumValidationService, IImageService imageService)
    {
        _albumRepository = albumRepository;
        _trackRepository = trackRepository;
        _albumValidationService = albumValidationService;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/albums")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        [FromBody] CreateAlbumRequest createRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            createRequest = _albumValidationService.ValidateCreate(createRequest);

            // Albums may only contain the owner's own tracks
            var ownedIds = await _trackRepository.GetOwnedTrackIdsAsync(username, createRequest.TrackIds);
            var notOwned = createRequest.TrackIds.Except(ownedIds, StringComparer.OrdinalIgnoreCase).ToList();
            if (notOwned.Count > 0)
                return Error(HttpStatusCode.BadRequest,
                    $"albums may only contain your own tracks; not yours or not found: {string.Join(", ", notOwned)}",
                    "Bad Request");

            // Id is minted here so the cover lands on its final key before any write —
            // a bad image 400s without leaving a half-created album behind
            var albumId = Guid.NewGuid().ToString("N").ToLowerInvariant();

            ImageProcessingResult? image = null;
            if (createRequest.ImageKey is not null)
            {
                image = await _imageService.ProcessImageAsync(
                    createRequest.ImageKey, $"albums/{albumId}/cover_400x400.jpg", 400, 400);
            }

            var album = await _albumRepository.CreateAlbumAsync(
                albumId, username, createRequest.Name!, createRequest.Description, image, createRequest.TrackIds);

            return Created(JsonSerializer.Serialize(album, CustomJsonSerializerContext.Default.Album));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in CreateAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
