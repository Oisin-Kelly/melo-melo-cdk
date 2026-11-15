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

namespace GetTrackAppearsInLambda;

public record TrackAppearsInResponse
{
    [JsonPropertyName("albums")] public required List<AlbumSummary> Albums { get; set; }
    [JsonPropertyName("playlists")] public required List<Playlist> Playlists { get; set; }
}

// Where a track is found, for its page: the albums holding it that the viewer can open,
// and the viewer's own playlists that hold it (playlists are private, so only theirs)
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IAlbumTracklistRepository _albumTracklistRepository;
    private readonly IPlaylistRepository _playlistRepository;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository,
        IAlbumTracklistRepository albumTracklistRepository, IPlaylistRepository playlistRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _albumTracklistRepository = albumTracklistRepository;
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}/appears-in")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string trackId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;
        if (string.IsNullOrWhiteSpace(trackId))
            return Error(HttpStatusCode.BadRequest, "the path parameter 'trackId' is missing", "Bad Request");

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var isOwner = track.Owner.Username == username;
            if (!isOwner && !await _sharedTrackRepository.IsTrackAccessibleToUser(trackId, username))
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var albumsTask = _albumTracklistRepository.GetAlbumsContainingTrackAsync(track.Id, track.Owner.Username, username);
            var playlistsTask = _playlistRepository.GetPlaylistsContainingTrackAsync(username, track.Id);
            await Task.WhenAll(albumsTask, playlistsTask);

            var response = new TrackAppearsInResponse { Albums = albumsTask.Result, Playlists = playlistsTask.Result };
            return Ok(JsonSerializer.Serialize(response, GetTrackAppearsInJsonContext.Default.TrackAppearsInResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackAppearsInLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
