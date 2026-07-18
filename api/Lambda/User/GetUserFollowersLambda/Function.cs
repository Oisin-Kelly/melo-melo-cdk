using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetUserFollowersLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IUserRepository _userRepository;

    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/followers")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;
        if (string.IsNullOrWhiteSpace(username))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'username' is missing", "Bad Request");

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var user = await _userRepository.GetUserByUsername(username);
            if (user == null)
                return Error(HttpStatusCode.NotFound, $"no user found by username {username}", "Not Found");

            if (user.FollowersPrivate && username != requestorUsername)
                return Error(HttpStatusCode.Forbidden, $"{username} has their followers private", "Forbidden");

            var result = await _userRepository.GetUserFollowers(username, PageSize, cursor);

            return Ok(
                JsonSerializer.Serialize(
                    result,
                    CustomJsonSerializerContext.Default.PaginatedResultUserSummary
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserFollowersLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
