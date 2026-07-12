using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace ModifyPlaylistTracksLambda;

public record ModifyPlaylistTracksRequest
{
    [JsonPropertyName("add")] public List<string> Add { get; set; } = [];
    [JsonPropertyName("remove")] public List<string> Remove { get; set; } = [];
}

public record ModifyPlaylistTracksResponse
{
    [JsonPropertyName("added")] public required int Added { get; set; }
    [JsonPropertyName("removed")] public required int Removed { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxTracksPerRequest = 50;

    private readonly IPlaylistRepository _playlistRepository;
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(IPlaylistRepository playlistRepository, ITrackRepository trackRepository,
        ISharedTrackRepository sharedTrackRepository)
    {
        _playlistRepository = playlistRepository;
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/playlists/{playlistId}/tracks")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId,
        [FromBody] ModifyPlaylistTracksRequest modifyRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var addIds = modifyRequest.Add.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var removeIds = modifyRequest.Remove.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            if (addIds.Count == 0 && removeIds.Count == 0)
                return Error(HttpStatusCode.BadRequest, "provide at least one track in add or remove", "Bad Request");
            if (addIds.Count > MaxTracksPerRequest || removeIds.Count > MaxTracksPerRequest)
                return Error(HttpStatusCode.BadRequest,
                    $"at most {MaxTracksPerRequest} tracks per add/remove list", "Bad Request");

            var playlist = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (playlist is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (playlist.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest,
                    "the likes playlist is managed via POST /tracks/{trackId}/like", "Bad Request");

            var (tracksToAdd, inaccessibleIds) = await ResolveAccessibleTracksAsync(addIds, username);
            if (inaccessibleIds.Count > 0)
                return Error(HttpStatusCode.BadRequest,
                    $"tracks not found or not accessible: {string.Join(", ", inaccessibleIds)}", "Bad Request");

            await Task.WhenAll(
                _playlistRepository.AddTracksAsync(playlist.Id, tracksToAdd),
                _playlistRepository.RemoveTracksAsync(playlist.Id, removeIds));

            var response = new ModifyPlaylistTracksResponse { Added = tracksToAdd.Count, Removed = removeIds.Count };
            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.ModifyPlaylistTracksResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ModifyPlaylistTracksLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    private async Task<(List<Track> Tracks, List<string> InaccessibleIds)> ResolveAccessibleTracksAsync(
        List<string> trackIds, string username)
    {
        var lookups = trackIds.Select(async trackId =>
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null)
                return (trackId, track: null as Track);

            var hasAccess = track.Owner.Username == username ||
                            await _sharedTrackRepository.IsTrackAccessibleToUser(trackId, username);

            return (trackId, track: hasAccess ? track : null);
        }).ToList();

        var results = await Task.WhenAll(lookups);

        return (
            results.Where(r => r.track is not null).Select(r => r.track!).ToList(),
            results.Where(r => r.track is null).Select(r => r.trackId).ToList()
        );
    }
}
