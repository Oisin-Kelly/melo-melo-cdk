using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetUserTracksLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;

    public Function(ITrackRepository trackRepository)
    {
        _trackRepository = trackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);
        var limit = ParseLimit(request.QueryStringParameters);

        try
        {
            var result = await _trackRepository.GetTracksByUsername(requestorUsername, limit, cursor);
            return Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultTrackSummary));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserTracksLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
