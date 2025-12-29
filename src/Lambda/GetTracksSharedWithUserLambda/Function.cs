using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Text.Json;
using Adapters;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Ports;

namespace GetTracksSharedWithUserLambda;

public class Function
{
    private readonly ISharedTrackRepository _sharedTrackRepository;

    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(Function))]
    [DynamicDependency(DynamicallyAccessedMemberTypes.All, typeof(SharedTrackRepository))]
    public Function(ISharedTrackRepository sharedTrackRepository)
    {
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    public async Task<APIGatewayProxyResponse> FunctionHandler(APIGatewayProxyRequest request, ILambdaContext context)
    {
        var requestorUsername = request.RequestContext.Authorizer.Claims["cognito:username"];

        try
        {
            var sharedTracks = await _sharedTrackRepository.GetTracksSharedWithUser(requestorUsername);
            
            return new APIGatewayProxyResponse
            {
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } },
                Body = JsonSerializer.Serialize(sharedTracks, CustomJsonSerializerContext.Default.ListSharedTrack)
            };
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTracksSharedWithUserLambda. Error: {ex.Message}");
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
