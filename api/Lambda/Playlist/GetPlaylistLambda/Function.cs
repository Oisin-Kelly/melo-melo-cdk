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

namespace GetPlaylistLambda;

public record PlaylistDetailResponse
{
    [JsonPropertyName("playlist")] public required Playlist Playlist { get; set; }
    [JsonPropertyName("tracks")] public required PaginatedResult<PlaylistTrackEntry> Tracks { get; set; }
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
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var playlist = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (playlist is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");

            PaginatedResult<PlaylistTrackEntry> tracks;
            if (playlist.Type == PlaylistType.Likes)
            {
                // Likes membership is the like record (no denormalized name), so a track
                // that's since been deleted or had access revoked is simply dropped
                var liked = await _likeRepository.GetLikedTracksAsync(username, PageSize, cursor);
                var accessible = await FilterToAccessibleAsync(liked.Items, username);
                tracks = new PaginatedResult<PlaylistTrackEntry>
                {
                    Items = accessible.Select(ToAvailableEntry).ToList(),
                    NextCursor = liked.NextCursor,
                };
            }
            else
            {
                var page = await _playlistRepository.GetPlaylistTracksAsync(playlist.Id, username, PageSize, cursor);
                tracks = await MarkRevokedEntriesAsync(page, username);
            }

            var response = new PlaylistDetailResponse { Playlist = playlist, Tracks = tracks };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.PlaylistDetailResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetPlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }

    // An available entry whose track the owner has since lost access to becomes a
    // REVOKED placeholder (kept in the playlist, removable) rather than being dropped
    private async Task<PaginatedResult<PlaylistTrackEntry>> MarkRevokedEntriesAsync(
        PaginatedResult<PlaylistTrackEntry> page, string username)
    {
        var checks = page.Items.Select(async entry =>
        {
            if (entry.Unavailable || entry.Track is null)
                return entry; // already a DELETED placeholder

            var hasAccess = entry.Track.Owner.Username == username ||
                            await _sharedTrackRepository.IsTrackAccessibleToUser(entry.TrackId, username);
            if (hasAccess)
                return entry;

            entry.Unavailable = true;
            entry.Reason = PlaylistTrackReason.Revoked;
            entry.Track = null;
            return entry;
        });

        var items = (await Task.WhenAll(checks)).ToList();
        return new PaginatedResult<PlaylistTrackEntry> { Items = items, NextCursor = page.NextCursor };
    }

    // Drops liked tracks the caller can no longer access (owner/direct/album-grant)
    private async Task<List<TrackSummary>> FilterToAccessibleAsync(IReadOnlyList<TrackSummary> tracks, string username)
    {
        var checks = tracks.Select(async track =>
            track.Owner.Username == username ||
            await _sharedTrackRepository.IsTrackAccessibleToUser(track.Id, username)
                ? track
                : null);

        return (await Task.WhenAll(checks)).OfType<TrackSummary>().ToList();
    }

    private static PlaylistTrackEntry ToAvailableEntry(TrackSummary track) => new()
    {
        TrackId = track.Id,
        Name = track.Name,
        Duration = track.Duration,
        AddedAt = track.CreatedAt,
        Unavailable = false,
        Track = track,
    };
}
