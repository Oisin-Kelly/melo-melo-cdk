using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Text.Json;
using Adapters;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Ports;

namespace GetTrackLambda;

public class Function
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;

    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(Function))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(TrackRepository))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(SharedTrackRepository))]
    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request,
        ILambdaContext context)
    {
        var trackId = request.PathParameters["trackId"];
        var requestorUsername = request.RequestContext.Authorizer.Claims["cognito:username"];

        if (string.IsNullOrWhiteSpace(trackId))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'trackId' is missing", "Bad Request");

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);

            if (track == null || track.Owner.Username != requestorUsername &&
                !await _sharedTrackRepository.IsTrackSharedWithUser(trackId, requestorUsername))
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            return new APIGatewayProxyResponse
            {
                StatusCode = (int)HttpStatusCode.OK,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(
                    track,
                    CustomJsonSerializerContext.Default.Track
                )
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    private static APIGatewayProxyResponse Error(HttpStatusCode statusCode, string message, string error)
    {
        return new APIGatewayProxyResponse
        {
            StatusCode = (int)statusCode,
            Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
            Body = JsonSerializer.Serialize(new
                ErrorResponse(error, message, (int)statusCode), CustomJsonSerializerContext.Default.ErrorResponse)
        };
    }
}