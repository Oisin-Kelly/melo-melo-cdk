using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace DeletePlaylistLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IPlaylistRepository _playlistRepository;

    public Function(IPlaylistRepository playlistRepository)
    {
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/playlists/{playlistId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string playlistId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var existing = await _playlistRepository.GetPlaylistAsync(username, playlistId);
            if (existing is null)
                return Error(HttpStatusCode.NotFound, $"no playlist found by id {playlistId}", "Not Found");
            if (existing.Type == PlaylistType.Likes)
                return Error(HttpStatusCode.BadRequest, "the likes playlist cannot be deleted", "Bad Request");

            await _playlistRepository.DeletePlaylistAsync(username, playlistId);

            return Ok("{\"message\":\"Playlist deleted.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in DeletePlaylistLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
