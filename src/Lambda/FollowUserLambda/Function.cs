using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace FollowUserLambda;

public record FollowUserRequest
{
    [JsonPropertyName("newValue")] public bool? NewValue { get; init; }
}

public record FollowUserResponse
{
    [JsonPropertyName("newValue")] public bool NewValue { get; init; }
}

public class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;

    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/users/{username}/follow-user")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username, [FromBody] FollowUserRequest followUserRequest)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];
        if (followUserRequest.NewValue == null)
            return Error(HttpStatusCode.BadRequest,
                "The 'newValue' property is required and must be a boolean (true/false).",
                "Bad Request");

        try
        {
            var user = await _userRepository.GetUserByUsername(username);
            if (user == null)
                return Error(HttpStatusCode.NotFound, $"User {username} not found", "Not found");

            var isFollowing = followUserRequest.NewValue.Value;

            if (isFollowing)
                await _userRepository.FollowUser(username, requestorUsername);
            else
                await _userRepository.UnfollowUser(username, requestorUsername);

            return Ok(
                JsonSerializer.Serialize(
                    new FollowUserResponse { NewValue = isFollowing },
                    CustomJsonSerializerContext.Default.FollowUserResponse
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}