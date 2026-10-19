using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetUserFollowingLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IUserRepository _userRepository;
    private readonly IFollowRepository _followRepository;

    public Function(IUserRepository userRepository, IFollowRepository followRepository)
    {
        _userRepository = userRepository;
        _followRepository = followRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/followings")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        username = NormaliseUsername(username);
        if (string.IsNullOrWhiteSpace(username))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'username' is missing", "Bad Request");

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var user = await _userRepository.GetUserByUsername(username);
            if (user == null)
                return Error(HttpStatusCode.NotFound, $"no user found by username {username}", "Not Found");

            if (user.FollowingsPrivate && username != requestorUsername)
                return Error(HttpStatusCode.Forbidden, $"{username} has their followings private", "Forbidden");

            var result = await _followRepository.GetUserFollowings(username, PageSize, cursor);

            return Ok(
                JsonSerializer.Serialize(
                    result,
                    GetUserFollowingJsonContext.Default.PaginatedResultUserSummary
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserFollowingLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
