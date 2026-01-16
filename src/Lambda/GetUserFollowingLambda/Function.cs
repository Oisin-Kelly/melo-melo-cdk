using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetUserFollowingLambda;

public class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;

    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/followings")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];
        if (string.IsNullOrWhiteSpace(username))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'username' is missing", "Bad Request");

        try
        {
            var user = await _userRepository.GetUserByUsername(username);
            if (user == null)
                return Error(HttpStatusCode.NotFound, $"no user found by username {username}", "Not Found");

            if (user.FollowingsPrivate && username != requestorUsername)
                return Error(HttpStatusCode.Forbidden, $"{username} has their followings private", "Forbidden");

            var userFollowings = await _userRepository.GetUserFollowings(username);

            return Ok(
                JsonSerializer.Serialize(
                    userFollowings,
                    CustomJsonSerializerContext.Default.ListUser
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUserFollowingLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}