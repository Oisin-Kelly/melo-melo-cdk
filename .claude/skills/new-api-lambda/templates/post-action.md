# POST action with request body

Use this pattern for mutations or actions that accept a JSON body and return a custom response record — not a domain entity.

**Real example:** `FollowUserLambda`

```csharp
// Function.cs
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace LikeTrackLambda;

public record LikeTrackRequest
{
    [JsonPropertyName("newValue")] public bool? NewValue { get; init; }
}

public record LikeTrackResponse
{
    [JsonPropertyName("newValue")] public bool NewValue { get; init; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;

    public Function(ITrackRepository trackRepository)
    {
        _trackRepository = trackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/tracks/{trackId}/like")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId,
        [FromBody] LikeTrackRequest likeTrackRequest)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        if (likeTrackRequest.NewValue is null)
            return Error(HttpStatusCode.BadRequest,
                "The 'newValue' property is required and must be a boolean (true/false).",
                "Bad Request");

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track == null)
                return Error(HttpStatusCode.NotFound, $"Track {trackId} not found", "Not Found");

            var liked = likeTrackRequest.NewValue.Value;

            if (liked)
                await _trackRepository.LikeTrack(trackId, requestorUsername);
            else
                await _trackRepository.UnlikeTrack(trackId, requestorUsername);

            return Ok(
                JsonSerializer.Serialize(
                    new LikeTrackResponse { NewValue = liked },
                    CustomJsonSerializerContext.Default.LikeTrackResponse
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in LikeTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
```

**Key points:**
- Define request and response records in the same file, above `Function`
- Validate nullable body fields before hitting any repository
- Both `{Name}Request` and `{Name}Response` must be registered in `CustomJsonSerializerContext`
- `[FromBody]` goes after path parameters in the method signature
