using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetTracksSharedFromUserLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

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
        var (requestorUsername, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var result = await _sharedTrackRepository.GetTracksSharedFromUser(username, requestorUsername, PageSize, cursor);

            return Ok(
                JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultSharedTrack)
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTracksSharedFromUserLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
