using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports;

namespace UpdateAlbumLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumValidationService _albumValidationService;

    public Function(IAlbumRepository albumRepository, IAlbumValidationService albumValidationService)
    {
        _albumRepository = albumRepository;
        _albumValidationService = albumValidationService;
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

            var updated = await _albumRepository.UpdateAlbumAsync(
                username, album.Id, updateRequest.Name, updateRequest.Description);

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
