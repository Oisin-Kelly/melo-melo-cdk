using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace UpdateProgressLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IProgressRepository _progressRepository;

    public Function(IProgressRepository progressRepository)
    {
        _progressRepository = progressRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/me/progress")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, [FromBody] UpdateProgressRequest progressRequest)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        var completed = progressRequest.Completed == true;

        string? contextType = null;
        if (!completed)
        {
            contextType = progressRequest.ContextType?.Trim().ToUpperInvariant();
            if (contextType is null || !ProgressContextType.All.Contains(contextType))
                return Error(HttpStatusCode.BadRequest, "contextType must be TRACK, ALBUM or PLAYLIST", "Bad Request");
            if (string.IsNullOrWhiteSpace(progressRequest.ContextId) || string.IsNullOrWhiteSpace(progressRequest.TrackId))
                return Error(HttpStatusCode.BadRequest, "contextId and trackId are required", "Bad Request");
            if (progressRequest.PositionSeconds is null or < 0)
                return Error(HttpStatusCode.BadRequest, "positionSeconds must be a non-negative integer", "Bad Request");
        }

        try
        {
            if (completed)
            {
                await _progressRepository.ClearAsync(username);
                return Ok("{\"message\":\"Progress cleared.\"}");
            }

            await _progressRepository.UpsertAsync(username, contextType!, progressRequest.ContextId!,
                progressRequest.TrackId!, progressRequest.PositionSeconds!.Value);

            return Ok("{\"message\":\"Progress saved.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdateProgressLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
