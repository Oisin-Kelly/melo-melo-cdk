using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetLikedAlbumsLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumLikeRepository _albumLikeRepository;
    private readonly IAlbumShareRepository _albumShareRepository;

    public Function(IAlbumLikeRepository albumLikeRepository, IAlbumShareRepository albumShareRepository)
    {
        _albumLikeRepository = albumLikeRepository;
        _albumShareRepository = albumShareRepository;
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
            var page = await _albumLikeRepository.GetLikedAlbumsAsync(username, limit, cursor);
            // A like outlives losing access (unshared, or removed from your library) and is still
            // there if the album is shared again; while it's not yours to open, it's left out —
            // the same rule as liked tracks. A page can come back short; the cursor still continues.
            var result = new PaginatedResult<AlbumSummary>
            {
                Items = await FilterToAccessibleAsync(page.Items, username),
                NextCursor = page.NextCursor,
            };
            return Ok(JsonSerializer.Serialize(result, GetLikedAlbumsJsonContext.Default.PaginatedResultAlbumSummary));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLikedAlbumsLambda. Error: {ex.Message}");
            return InternalError();
        }
    }

    // Your own albums, or ones currently shared with you
    private async Task<List<AlbumSummary>> FilterToAccessibleAsync(IReadOnlyList<AlbumSummary> albums, string username)
    {
        var checks = albums.Select(async album =>
            album.Owner.Username == username ||
            await _albumShareRepository.IsAlbumSharedWithUserAsync(album.Id, username)
                ? album
                : null);

        return (await Task.WhenAll(checks)).OfType<AlbumSummary>().ToList();
    }
}
