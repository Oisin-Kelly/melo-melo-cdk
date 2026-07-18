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
    private readonly IAlbumLikeRepository _albumLikeRepository;

    public Function(IAlbumRepository albumRepository, IAlbumLikeRepository albumLikeRepository)
    {
        _albumRepository = albumRepository;
        _albumLikeRepository = albumLikeRepository;
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
            var isOwner = album.OwnerUsername == username;
            if (!isOwner && !await _albumRepository.IsAlbumSharedWithUserAsync(album.Id, username))
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            album.LikedByMe = await _albumLikeRepository.IsAlbumLikedByUserAsync(album.Id, username);
            if (!isOwner)
            {
                // share/like counts are visible to the owner only
                album.ShareCount = null;
                album.LikeCount = null;
            }

            var tracks = await _albumRepository.GetAlbumTracksAsync(album.Id, username, PageSize, cursor);

            var response = new AlbumDetailResponse { Album = album, Tracks = tracks };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.AlbumDetailResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
