using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetAlbumsSharedFromUserLambda;

// Albums one person shared with the caller, newest first — a profile's "Albums shared with you"
// row (the album mirror of GET /users/{username}/shared)
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumShareRepository _albumShareRepository;

    public Function(IAlbumShareRepository albumShareRepository)
    {
        _albumShareRepository = albumShareRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/albums/shared")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context, string username)
    {
        var (requestorUsername, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;
        username = NormaliseUsername(username);

        string? cursor = null;
        request.QueryStringParameters?.TryGetValue("cursor", out cursor);
        var limit = ParseLimit(request.QueryStringParameters);

        try
        {
            var result = await _albumShareRepository.GetAlbumsSharedFromUserAsync(username, requestorUsername,
                limit, cursor);
            return Ok(JsonSerializer.Serialize(result,
                GetAlbumsSharedFromUserJsonContext.Default.PaginatedResultSharedAlbum));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumsSharedFromUserLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
