using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace MarkSeenLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;

    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    // Bumps lastSeenAt so the client can render the new-since-last-visit divider.
    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/me/seen")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            await _userRepository.MarkSeenAsync(username);
            return Ok("{\"message\":\"Marked seen.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in MarkSeenLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
