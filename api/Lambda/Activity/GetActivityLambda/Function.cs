using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetActivityLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 20;

    private readonly IActivityRepository _activityRepository;

    public Function(IActivityRepository activityRepository)
    {
        _activityRepository = activityRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/activity")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var result = await _activityRepository.GetActivityAsync(username, PageSize, cursor);
            return Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultActivityEntry));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetActivityLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
