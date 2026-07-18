using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetAlbumLikesLambda;

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
    [HttpApi(LambdaHttpMethod.Get, "/albums/{albumId}/likes")]
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
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            var result = await _albumLikeRepository.GetAlbumLikersAsync(album.Id, PageSize, cursor);
            return Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultAlbumLiker));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumLikesLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
