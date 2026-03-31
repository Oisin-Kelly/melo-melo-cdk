# POST update — partial update with multiple services

Use this pattern when updating a resource that may involve multiple services (e.g. file processing + DB write). The caller updates their own resource using their JWT identity.

**Real example:** `UpdateUserProfileLambda`

```csharp
// Function.cs
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports;

namespace UpdatePlaylistLambda;

public record UpdatePlaylistRequest
{
    [JsonPropertyName("name")]        public string? Name { get; set; }
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("isPublic")]    public bool IsPublic { get; set; }
    [JsonPropertyName("coverImageKey")] public string? CoverImageKey { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;
    private readonly IImageService _imageService;

    public Function(IPlaylistRepository playlistRepository, IImageService imageService)
    {
        _playlistRepository = playlistRepository;
        _imageService = imageService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/playlists/{playlistId}/update")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId,
        [FromBody] UpdatePlaylistRequest updateRequest)
    {
        var requestorUsername = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var updated = await BuildUpdatedPlaylist(updateRequest, playlistId, requestorUsername);
            var result = await _playlistRepository.UpdatePlaylist(updated);

            return result is null
                ? Error(HttpStatusCode.InternalServerError, "Could not update playlist", "Internal Server Error")
                : Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.Playlist));
        }
        catch (ArgumentException aex)
        {
            context.Logger.LogError(aex.Message);
            return Error(HttpStatusCode.BadRequest, aex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in UpdatePlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    private async Task<Playlist> BuildUpdatedPlaylist(
        UpdatePlaylistRequest req,
        string playlistId,
        string username)
    {
        ImageProcessingResult? imageResult = null;

        if (req.CoverImageKey is not null)
        {
            imageResult = await _imageService.ProcessImageAsync(
                req.CoverImageKey,
                $"playlists/{playlistId}/cover_400x400.jpg",
                400,
                400
            );
        }

        return new Playlist
        {
            PlaylistId = playlistId,
            OwnerUsername = username,
            Name = req.Name,
            Description = req.Description,
            IsPublic = req.IsPublic,
            ImageUrl = imageResult?.ImageUrl,
            ImageBgColor = imageResult?.ImageHex,
        };
    }
}
```

**Key points:**
- Catch `ArgumentException` separately (validation errors → 400) before the general `Exception` catch (→ 500)
- Extract complex object construction into a private `async` helper to keep `FunctionHandler` readable
- `null` result from the repository signals a write failure — return 500
- Image processing is optional — only process if the key is provided
- Requires `IImageService` in DI — see `di-patterns.md` for S3 keyed service setup
