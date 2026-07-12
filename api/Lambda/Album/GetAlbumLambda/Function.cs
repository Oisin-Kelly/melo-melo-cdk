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
    [JsonPropertyName("tracks")] public required PaginatedResult<Track> Tracks { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IAlbumRepository _albumRepository;

    public Function(IAlbumRepository albumRepository)
    {
        _albumRepository = albumRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/albums/{albumId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

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

            var tracks = await _albumRepository.GetAlbumTracksAsync(album.Id, PageSize, cursor);

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
