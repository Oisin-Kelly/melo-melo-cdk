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

namespace GetPlaylistLambda;

public record PlaylistDetailResponse
{
    [JsonPropertyName("playlist")] public required Playlist Playlist { get; set; }
    [JsonPropertyName("tracks")] public required PaginatedResult<Track> Tracks { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IPlaylistRepository _playlistRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly ILikeRepository _likeRepository;

    public Function(IPlaylistRepository playlistRepository, ISharedTrackRepository sharedTrackRepository,
        ILikeRepository likeRepository)
    {
        _playlistRepository = playlistRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _likeRepository = likeRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/playlists/{playlistId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var playlist = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (playlist is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");

            var page = playlist.Type == PlaylistType.Likes
                ? await _likeRepository.GetLikedTracksAsync(username, PageSize, cursor)
                : await _playlistRepository.GetPlaylistTracksAsync(playlist.Id, PageSize, cursor);

            var tracks = await FilterToAccessibleTracksAsync(page, username);

            var response = new PlaylistDetailResponse { Playlist = playlist, Tracks = tracks };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.PlaylistDetailResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetPlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    // Tracks the caller has since lost access to stay in the playlist record but are dropped from reads
    private async Task<PaginatedResult<Track>> FilterToAccessibleTracksAsync(PaginatedResult<Track> page,
        string username)
    {
        var accessChecks = page.Items
            .Select(async track => track.Owner.Username == username ||
                                   await _sharedTrackRepository.IsTrackAccessibleToUser(track.Id, username)
                ? track
                : null)
            .ToList();

        var accessibleTracks = (await Task.WhenAll(accessChecks)).OfType<Track>().ToList();

        return new PaginatedResult<Track> { Items = accessibleTracks, NextCursor = page.NextCursor };
    }
}
