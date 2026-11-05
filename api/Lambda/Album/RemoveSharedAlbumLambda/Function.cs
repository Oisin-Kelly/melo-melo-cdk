using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace RemoveSharedAlbumLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumShareRepository _albumShareRepository;

    public Function(IAlbumShareRepository albumShareRepository)
    {
        _albumShareRepository = albumShareRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/albums/shared/{albumId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            await _albumShareRepository.RemoveAlbumFromLibraryAsync(albumId, username);
            return Ok("{\"message\":\"Album removed from library.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in RemoveSharedAlbumLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
