using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace ResolveSlugLambda;

// Readable URL → item id. The client then loads the item through its normal detail endpoint.
// Every miss is the same 404 — no such slug, no access, someone else's playlist, or an old slug of
// an item you can't see — so a guessed URL never reveals that something exists or what it's
// called now. The canonical slug (which differs after a URL change) is only returned past the
// access check.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ISlugRepository _slugRepository;
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumShareRepository _albumShareRepository;
    private readonly IPlaylistRepository _playlistRepository;

    public Function(ISlugRepository slugRepository, ITrackRepository trackRepository,
        ISharedTrackRepository sharedTrackRepository, IAlbumRepository albumRepository,
        IAlbumShareRepository albumShareRepository, IPlaylistRepository playlistRepository)
    {
        _slugRepository = slugRepository;
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _albumRepository = albumRepository;
        _albumShareRepository = albumShareRepository;
        _playlistRepository = playlistRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/{username}/slugs/{kind}/{slug}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string username,
        string kind,
        string slug)
    {
        var (caller, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        var owner = NormaliseUsername(username);
        var slugKind = SlugKind.FromPathSegment(kind);
        if (slugKind is null)
            return NotFound();

        try
        {
            // Playlists are private: nobody else's resolve even reaches the table
            if (slugKind == SlugKind.Playlist && caller != owner)
                return NotFound();

            var targetId = await _slugRepository.GetTargetIdAsync(owner, slugKind, slug);
            if (targetId is null)
                return NotFound();

            var canonical = slugKind switch
            {
                SlugKind.Track => await ResolveTrackAsync(owner, caller, targetId),
                SlugKind.Album => await ResolveAlbumAsync(owner, caller, targetId),
                _ => await ResolvePlaylistAsync(owner, targetId),
            };
            if (canonical is null)
                return NotFound();

            var resolved = new ResolvedSlug { Id = targetId, Slug = canonical };
            return Ok(JsonSerializer.Serialize(resolved, ResolveSlugJsonContext.Default.ResolvedSlug));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ResolveSlugLambda. Error: {ex.Message}");
            return InternalError();
        }
    }

    // Each returns the item's canonical slug, or null when it's gone or the caller can't see it
    private async Task<string?> ResolveTrackAsync(string owner, string caller, string trackId)
    {
        var track = await _trackRepository.GetTrackAsync(trackId);
        if (track is null || track.Owner.Username != owner)
            return null;
        if (caller != owner && !await _sharedTrackRepository.IsTrackAccessibleToUser(trackId, caller))
            return null;
        return track.Slug;
    }

    private async Task<string?> ResolveAlbumAsync(string owner, string caller, string albumId)
    {
        var album = await _albumRepository.GetAlbumByIdAsync(albumId);
        if (album is null || album.OwnerUsername != owner)
            return null;
        if (caller != owner && !await _albumShareRepository.IsAlbumSharedWithUserAsync(albumId, caller))
            return null;
        return album.Slug;
    }

    private async Task<string?> ResolvePlaylistAsync(string owner, string playlistId)
    {
        var playlist = await _playlistRepository.GetPlaylistAsync(owner, playlistId);
        return playlist?.Slug;
    }

    private static APIGatewayHttpApiV2ProxyResponse NotFound() =>
        Error(HttpStatusCode.NotFound, "This isn't available", "Not Found");
}
