using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace MarkActivitySeenLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IActivityRepository _activityRepository;

    public Function(IActivityRepository activityRepository)
    {
        _activityRepository = activityRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/me/activity-seen")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            await _activityRepository.MarkActivitySeenAsync(username);
            return Ok("{\"message\":\"Activity marked seen.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in MarkActivitySeenLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
