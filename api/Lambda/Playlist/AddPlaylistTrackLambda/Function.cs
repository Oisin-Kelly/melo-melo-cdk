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

namespace AddPlaylistTrackLambda;

public record AddPlaylistTrackResponse
{
    [JsonPropertyName("trackId")] public required string TrackId { get; set; }
    [JsonPropertyName("added")] public required bool Added { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
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
    [HttpApi(LambdaHttpMethod.Post, "/playlists/{playlistId}/tracks/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId,
        string trackId)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var playlist = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (playlist is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (playlist.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest,
                    "the likes playlist is managed via POST /tracks/{trackId}/like", "Bad Request");

            var track = await _trackRepository.GetTrackAsync(trackId);
            var hasAccess = track is not null && (track.Owner.Username == username ||
                await _sharedTrackRepository.IsTrackAccessibleToUser(track.Id, username));
            if (track is null || !hasAccess)
                return Error(HttpStatusCode.BadRequest,
                    $"track not found or not accessible: {trackId}", "Bad Request");

            var added = await _playlistRepository.AddTrackAsync(username, playlist.Id, track);

            var response = new AddPlaylistTrackResponse { TrackId = track.Id, Added = added };
            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.AddPlaylistTrackResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in AddPlaylistTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
