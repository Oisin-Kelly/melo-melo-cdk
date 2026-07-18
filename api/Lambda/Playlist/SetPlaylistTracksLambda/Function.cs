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

namespace SetPlaylistTracksLambda;

public record SetPlaylistTracksRequest
{
    [JsonPropertyName("trackIds")] public List<string> TrackIds { get; set; } = [];
}

public record SetPlaylistTracksResponse
{
    [JsonPropertyName("trackCount")] public required int TrackCount { get; set; }
    [JsonPropertyName("removed")] public required int Removed { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxTracksPerRequest = 500;

    private readonly IPlaylistRepository _playlistRepository;

    public Function(IPlaylistRepository playlistRepository)
    {
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/playlists/{playlistId}/tracks")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId,
        [FromBody] SetPlaylistTracksRequest setRequest)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var trackIds = setRequest.TrackIds
                .Select(id => id.ToLowerInvariant())
                .Distinct()
                .ToList();

            if (trackIds.Count > MaxTracksPerRequest)
                return Error(HttpStatusCode.BadRequest,
                    $"at most {MaxTracksPerRequest} tracks per save", "Bad Request");

            var playlist = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (playlist is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (playlist.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest,
                    "the likes playlist is managed via POST /tracks/{trackId}/like", "Bad Request");

            var removed = await _playlistRepository.SetTracksAsync(username, playlist.Id, trackIds);

            var response = new SetPlaylistTracksResponse
            {
                TrackCount = trackIds.Count,
                Removed = removed,
            };
            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.SetPlaylistTracksResponse));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in SetPlaylistTracksLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}