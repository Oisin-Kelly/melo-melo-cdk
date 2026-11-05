using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetLibraryTracksLambda;

// Every track the caller can play — their own, direct shares, and every track in every album
// shared with them — in one unpaged list (nextCursor always null) for the client's search.
// Built fresh on each request, so new shares and album additions show up immediately.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(ISharedTrackRepository sharedTrackRepository)
    {
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/library")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var tracks = await _sharedTrackRepository.GetLibraryTracksAsync(username);
            var result = new PaginatedResult<TrackSummary> { Items = tracks, NextCursor = null };
            return Ok(JsonSerializer.Serialize(result, GetLibraryTracksJsonContext.Default.PaginatedResultTrackSummary));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLibraryTracksLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
