# GET for the authenticated caller

Use this pattern when fetching data that belongs to the authenticated user — no path parameter, identity comes from the JWT claim.

**Real example:** `GetTracksSharedWithUserLambda`

```csharp
// Function.cs
using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetMyPlaylistsLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;

    public Function(IPlaylistRepository playlistRepository)
    {
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/playlists")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var playlists = await _playlistRepository.GetPlaylistsByUsername(requestorUsername);

            return Ok(
                JsonSerializer.Serialize(
                    playlists,
                    CustomJsonSerializerContext.Default.ListPlaylist
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetMyPlaylistsLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
```

**Key points:**
- No path parameters — the caller's identity is the key
- `requestorUsername` comes from `request.RequestContext.Authorizer.Jwt.Claims["cognito:username"]`
- Returns a list — serialise with `CustomJsonSerializerContext.Default.List{Type}` (must be registered in the context)
- No 404 needed — an empty list is a valid response
