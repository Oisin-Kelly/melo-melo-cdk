using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace LikeAlbumLambda;

public record LikeAlbumRequest
{
    [JsonPropertyName("newValue")] public bool? NewValue { get; set; }
}

public record LikeAlbumResponse
{
    [JsonPropertyName("newValue")] public required bool NewValue { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumLikeRepository _albumLikeRepository;

    public Function(IAlbumRepository albumRepository, IAlbumLikeRepository albumLikeRepository)
    {
        _albumRepository = albumRepository;
        _albumLikeRepository = albumLikeRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/albums/{albumId}/like")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string albumId, [FromBody] LikeAlbumRequest likeRequest)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        if (likeRequest.NewValue == null)
            return Error(HttpStatusCode.BadRequest,
                "The 'newValue' property is required and must be a boolean (true/false).", "Bad Request");

        try
        {
            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            var newValue = likeRequest.NewValue.Value;

            if (newValue)
            {
                var hasAccess = album.OwnerUsername == username ||
                                await _albumRepository.IsAlbumSharedWithUserAsync(album.Id, username);
                if (!hasAccess)
                    return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

                await _albumLikeRepository.LikeAlbumAsync(album.Id, username, album.OwnerUsername!);
            }
            else
            {
                // unliking always allowed, regardless if album is shared with user
                await _albumLikeRepository.UnlikeAlbumAsync(album.Id, username, album.OwnerUsername!);
            }

            var response = new LikeAlbumResponse { NewValue = newValue };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.LikeAlbumResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in LikeAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
