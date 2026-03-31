using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetTracksSharedFromUserLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(ISharedTrackRepository sharedTrackRepository)
    {
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/shared")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var sharedTracks =
                await _sharedTrackRepository.GetTracksSharedFromUser(username, requestorUsername);

            return Ok(
                JsonSerializer.Serialize(sharedTracks, CustomJsonSerializerContext.Default.ListSharedTrack)
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTracksSharedFromUserLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}