using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports;

namespace UpdateTrackLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly IImageService _imageService;
    private readonly ITrackValidationService _trackValidationService;

    public Function(ITrackRepository trackRepository, IImageService imageService,
        ITrackValidationService trackValidationService)
    {
        _trackRepository = trackRepository;
        _imageService = imageService;
        _trackValidationService = trackValidationService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/tracks/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId,
        [FromBody] UpdateTrackRequest updateRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            updateRequest = _trackValidationService.ValidateUpdate(updateRequest);

            ImageProcessingResult? image = null;
            if (updateRequest.ImageKey is not null)
            {
                image = await _imageService.ProcessImageAsync(
                    updateRequest.ImageKey,
                    $"tracks/{track.Id}/cover_400x400.jpg",
                    400,
                    400
                );
            }

            var updated = await _trackRepository.UpdateTrackAsync(
                username, track.Id, updateRequest.Name!, updateRequest.Genre, updateRequest.Description,
                image, updateRequest.ClearedImage);

            return updated is null
                ? Error(HttpStatusCode.InternalServerError, "Could not update track", "Internal Server Error")
                : Ok(JsonSerializer.Serialize(updated, CustomJsonSerializerContext.Default.Track));
        }
        catch (ArgumentException aex)
        {
            context.Logger.LogError(aex.Message);
            return Error(HttpStatusCode.BadRequest, aex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdateTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
