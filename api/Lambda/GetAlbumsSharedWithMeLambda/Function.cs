using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetAlbumsSharedWithMeLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IAlbumRepository _albumRepository;

    public Function(IAlbumRepository albumRepository)
    {
        _albumRepository = albumRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/albums/shared")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);

        try
        {
            var result = await _albumRepository.GetAlbumsSharedWithUserAsync(username, PageSize, cursor);
            return Ok(JsonSerializer.Serialize(result,
                CustomJsonSerializerContext.Default.PaginatedResultSharedAlbum));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumsSharedWithMeLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
