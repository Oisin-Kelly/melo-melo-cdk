using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace FollowUserLambda;

public record FollowUserRequest
{
    [JsonPropertyName("newValue")] public bool? NewValue { get; init; }
}

public record FollowUserResponse
{
    [JsonPropertyName("newValue")] public bool NewValue { get; init; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;
    private readonly IFollowRepository _followRepository;

    public Function(IUserRepository userRepository, IFollowRepository followRepository)
    {
        _userRepository = userRepository;
        _followRepository = followRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/users/{username}/follow-user")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username, [FromBody] FollowUserRequest followUserRequest)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        username = NormaliseUsername(username);
        if (followUserRequest.NewValue == null)
            return Error(HttpStatusCode.BadRequest,
                "The 'newValue' property is required and must be a boolean (true/false).",
                "Bad Request");

        if (string.Equals(username, requestorUsername, StringComparison.OrdinalIgnoreCase))
            return Error(HttpStatusCode.BadRequest, "You can't follow yourself.", "Bad Request");

        try
        {
            var user = await _userRepository.GetUserByUsername(username);
            if (user == null)
                return Error(HttpStatusCode.NotFound, $"User {username} not found", "Not found");

            var isFollowing = followUserRequest.NewValue.Value;

            if (isFollowing)
                await _followRepository.FollowUser(username, requestorUsername);
            else
                await _followRepository.UnfollowUser(username, requestorUsername);

            return Ok(
                JsonSerializer.Serialize(
                    new FollowUserResponse { NewValue = isFollowing },
                    FollowUserJsonContext.Default.FollowUserResponse
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in FollowUserLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}