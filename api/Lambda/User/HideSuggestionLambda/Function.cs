using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace HideSuggestionLambda;

// ✕ on a suggestion: stop suggesting this person (for 180 days). Idempotent; hiding someone
// who doesn't exist is harmless (they'd never be suggested anyway), so it isn't checked.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ISuggestionRepository _suggestionRepository;

    public Function(ISuggestionRepository suggestionRepository)
    {
        _suggestionRepository = suggestionRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/users/suggestions/{username}/hide")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        username = NormaliseUsername(username);
        if (string.IsNullOrWhiteSpace(username))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'username' is missing", "Bad Request");
        if (username == requestorUsername)
            return Error(HttpStatusCode.BadRequest, "You're never suggested to yourself.", "Bad Request");

        try
        {
            await _suggestionRepository.HideAsync(requestorUsername, username);
            return Ok("{\"message\":\"Hidden.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in HideSuggestionLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
