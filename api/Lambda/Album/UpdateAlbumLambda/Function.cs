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

namespace UpdateAlbumLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumValidationService _albumValidationService;
    private readonly IImageService _imageService;

    public Function(IAlbumRepository albumRepository, IAlbumValidationService albumValidationService,
        IImageService imageService)
    {
        _albumRepository = albumRepository;
        _albumValidationService = albumValidationService;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/albums/{albumId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId,
        [FromBody] UpdateAlbumRequest updateRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            updateRequest = _albumValidationService.ValidateUpdate(updateRequest);

            ImageProcessingResult? image = null;
            if (updateRequest.ImageKey is not null)
            {
                image = await _imageService.ProcessImageAsync(
                    updateRequest.ImageKey, $"albums/{album.Id}/cover_400x400.jpg", 400, 400);
            }

            var updated = await _albumRepository.UpdateAlbumAsync(
                username, album.Id, updateRequest.Name, updateRequest.Description,
                image, updateRequest.ClearedImage);

            return Ok(JsonSerializer.Serialize(updated, CustomJsonSerializerContext.Default.Album));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdateAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
