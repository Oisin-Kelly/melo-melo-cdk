using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetTrackLambda;

public class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
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

            var isTrackSharedWithUser = await _sharedTrackRepository.IsTrackSharedWithUser(trackId, requestorUsername);

            if (track.Owner.Username != requestorUsername && !isTrackSharedWithUser)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

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