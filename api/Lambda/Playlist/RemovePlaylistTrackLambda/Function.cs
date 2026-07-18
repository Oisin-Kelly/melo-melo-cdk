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

namespace RemovePlaylistTrackLambda;

public record RemovePlaylistTrackResponse
{
    [JsonPropertyName("trackId")] public required string TrackId { get; set; }
    [JsonPropertyName("removed")] public required bool Removed { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;

    public Function(IPlaylistRepository playlistRepository)
    {
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/playlists/{playlistId}/tracks/{trackId}")]
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

            var removed = await _playlistRepository.RemoveTrackAsync(username, playlist.Id, trackId);
            var response = new RemovePlaylistTrackResponse
            {
                TrackId = trackId.ToLowerInvariant(),
                Removed = removed,
            };

            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.RemovePlaylistTrackResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in RemovePlaylistTrackLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}