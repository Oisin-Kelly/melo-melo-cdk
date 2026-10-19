using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace RemoveSharedTrackLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(ISharedTrackRepository sharedTrackRepository)
    {
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/tracks/shared/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            await _sharedTrackRepository.RemoveTrackFromLibraryAsync(trackId, username);
            return Ok("{\"message\":\"Track removed from library.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in RemoveSharedTrackLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
