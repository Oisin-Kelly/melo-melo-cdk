using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetLikedAlbumsLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumLikeRepository _albumLikeRepository;

    public Function(IAlbumLikeRepository albumLikeRepository)
    {
        _albumLikeRepository = albumLikeRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/albums/liked")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);
        var limit = ParseLimit(request.QueryStringParameters);

        try
        {
            var result = await _albumLikeRepository.GetLikedAlbumsAsync(username, limit, cursor);
            return Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultAlbumSummary));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLikedAlbumsLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
