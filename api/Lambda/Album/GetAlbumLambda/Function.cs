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

namespace GetAlbumLambda;

public record AlbumDetailResponse
{
    [JsonPropertyName("album")] public required Album Album { get; set; }
    [JsonPropertyName("tracks")] public required PaginatedResult<TrackSummary> Tracks { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumShareRepository _albumShareRepository;
    private readonly IAlbumTracklistRepository _albumTracklistRepository;
    private readonly IAlbumLikeRepository _albumLikeRepository;
    private readonly IUserRepository _userRepository;

    public Function(IAlbumRepository albumRepository, IAlbumShareRepository albumShareRepository, IAlbumTracklistRepository albumTracklistRepository, IAlbumLikeRepository albumLikeRepository,
        IUserRepository userRepository)
    {
        _albumRepository = albumRepository;
        _albumShareRepository = albumShareRepository;
        _albumTracklistRepository = albumTracklistRepository;
        _albumLikeRepository = albumLikeRepository;
        _userRepository = userRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/albums/{albumId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            // Access: owner, or the album is shared with the requester. No per-track checks needed —
            // every track is the owner's, and access derives from the album share itself.
            // The share record is both the access check and the caption shown to the recipient
            var isOwner = album.OwnerUsername == username;
            var myShare = isOwner ? null : await _albumShareRepository.GetShareAsync(album.Id, username);
            if (!isOwner && myShare is null)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            // Independent reads, run together: like status, the owner's profile (the detail
            // carries `owner` for the album header), and the first tracklist page
            var likedTask = _albumLikeRepository.IsAlbumLikedByUserAsync(album.Id, username);
            var ownerTask = _userRepository.GetUserByUsername(album.OwnerUsername!);
            var tracksTask = _albumTracklistRepository.GetAlbumTracksAsync(album.Id, username, PageSize, cursor);
            await Task.WhenAll(likedTask, ownerTask, tracksTask);

            album.LikedByMe = likedTask.Result;
            album.MyShare = myShare;
            album.Owner = ownerTask.Result is { } owner ? UserSummary.From(owner) : null;
            if (!isOwner)
            {
                // share/like counts are visible to the owner only
                album.ShareCount = null;
                album.LikeCount = null;
            }

            var response = new AlbumDetailResponse { Album = album, Tracks = tracksTask.Result };
            return Ok(JsonSerializer.Serialize(response, GetAlbumJsonContext.Default.AlbumDetailResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
