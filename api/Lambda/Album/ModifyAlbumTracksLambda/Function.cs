using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace ModifyAlbumTracksLambda;

public record ModifyAlbumTracksRequest
{
    [JsonPropertyName("add")] public List<string> Add { get; set; } = [];
    [JsonPropertyName("remove")] public List<string> Remove { get; set; } = [];
}

public record ModifyAlbumTracksResponse
{
    [JsonPropertyName("added")] public required int Added { get; set; }
    [JsonPropertyName("removed")] public required int Removed { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxTracksPerAlbum = 50;

    private readonly IAlbumRepository _albumRepository;
    private readonly ITrackRepository _trackRepository;

    public Function(IAlbumRepository albumRepository, ITrackRepository trackRepository)
    {
        _albumRepository = albumRepository;
        _trackRepository = trackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/albums/{albumId}/tracks")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId,
        [FromBody] ModifyAlbumTracksRequest modifyRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var addIds = modifyRequest.Add.Select(id => id.ToLowerInvariant()).Distinct().ToList();
            var removeIds = modifyRequest.Remove.Select(id => id.ToLowerInvariant()).Distinct().ToList();

            if (addIds.Count == 0 && removeIds.Count == 0)
                return Error(HttpStatusCode.BadRequest, "provide at least one track in add or remove", "Bad Request");

            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            // Albums may only contain the owner's own tracks
            var ownedIds = await _trackRepository.GetOwnedTrackIdsAsync(username, addIds);
            var notOwned = addIds.Except(ownedIds, StringComparer.OrdinalIgnoreCase).ToList();
            if (notOwned.Count > 0)
                return Error(HttpStatusCode.BadRequest,
                    $"albums may only contain your own tracks; not yours or not found: {string.Join(", ", notOwned)}",
                    "Bad Request");

            var currentIds = await _albumRepository.GetAlbumTrackIdsAsync(album.Id);
            var totalAfter = currentIds.Union(addIds).Except(removeIds).Count();
            if (totalAfter > MaxTracksPerAlbum)
                return Error(HttpStatusCode.BadRequest, $"albums can hold at most {MaxTracksPerAlbum} tracks",
                    "Bad Request");

            // Adds fan out grants to existing recipients; removes revoke album-derived access
            await _albumRepository.AddTracksAsync(album.Id, username, addIds);
            await _albumRepository.RemoveTracksAsync(album.Id, removeIds);

            var response = new ModifyAlbumTracksResponse { Added = addIds.Count, Removed = removeIds.Count };
            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.ModifyAlbumTracksResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ModifyAlbumTracksLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
