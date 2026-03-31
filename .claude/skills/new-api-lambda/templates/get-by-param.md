# GET by path parameter

Use this pattern when fetching a single resource by a path parameter (e.g. GET /users/{username}, GET /tracks/{trackId}).

**Real example:** `GetUserLambda`

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

namespace GetPlaylistLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;

    public Function(IPlaylistRepository playlistRepository)
    {
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/playlists/{playlistId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId)
    {
        if (string.IsNullOrWhiteSpace(playlistId))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'playlistId' is missing", "Bad Request");

        try
        {
            var playlist = await _playlistRepository.GetPlaylistById(playlistId);

            if (playlist == null)
                return Error(HttpStatusCode.NotFound, $"no playlist found with id {playlistId}", "Not Found");

            return Ok(
                JsonSerializer.Serialize(
                    playlist,
                    CustomJsonSerializerContext.Default.Playlist
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetPlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
```

**Key points:**
- Validate the path param before hitting the repository
- Return 404 when the lookup returns null
- Serialise using the AOT context: `CustomJsonSerializerContext.Default.{Type}`
- No `requestorUsername` needed if the resource is public
