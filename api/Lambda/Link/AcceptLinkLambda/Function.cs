using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace AcceptLinkLambda;

// "Add to my library" from a share link: the caller becomes an ordinary recipient through the
// usual share upsert, so everything downstream (access, feed, Shared with, Remove from my library,
// shareCount) works as for a username share. Returns where the item lives.
//   - revoked / unknown / item deleted → 404; expired → 410 (the screen says which)
//   - your own link → 400; already have it (any route) → 200, nothing written
//   - the claim is counted before the share is written, guarded on the link still being live,
//     so a revoke or expiry racing this request wins
//   - the recipient's incomingShares setting isn't consulted: adding it is their own choice
//   - no "shared with you" activity: they added it themselves (the feed item is still written)
//   - the link's caption becomes the share's caption (feed, Shared with you)
public sealed class Function : BaseLambdaFunctionHandler
{
    public const string UnavailableMessage = "This link isn't available";
    public const string ExpiredMessage = "This link has expired";

    private readonly IShareLinkRepository _shareLinkRepository;
    private readonly ILinkTargetService _linkTargetService;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IAlbumShareRepository _albumShareRepository;

    public Function(IShareLinkRepository shareLinkRepository, ILinkTargetService linkTargetService,
        ISharedTrackRepository sharedTrackRepository, IAlbumShareRepository albumShareRepository)
    {
        _shareLinkRepository = shareLinkRepository;
        _linkTargetService = linkTargetService;
        _sharedTrackRepository = sharedTrackRepository;
        _albumShareRepository = albumShareRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/links/{token}/accept")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string token)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var link = await _shareLinkRepository.GetAsync(token);
            var state = link is null
                ? ShareLinkState.Revoked
                : ShareLinks.StateOf(link, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            if (link is null || state == ShareLinkState.Revoked)
                return Error(HttpStatusCode.NotFound, UnavailableMessage, "Not Found");

            var item = await _linkTargetService.GetAsync(link.Kind, link.TargetId);
            if (item is null)
                return Error(HttpStatusCode.NotFound, UnavailableMessage, "Not Found");

            if (item.Owner == username)
                return Error(HttpStatusCode.BadRequest, "This is your own link", "Bad Request");
            if (state == ShareLinkState.Expired)
                return Error(HttpStatusCode.Gone, ExpiredMessage, "Gone");

            var target = new LinkTarget { Kind = item.Kind, Id = item.Id, Owner = item.Owner, Slug = item.Slug };
            var response = Ok(JsonSerializer.Serialize(target, AcceptLinkJsonContext.Default.LinkTarget));

            // Already in their library (directly, or through a shared album): nothing to do
            if (await _linkTargetService.HasAccessAsync(item, username))
                return response;

            if (!await _shareLinkRepository.TryClaimAsync(link.Token))
            {
                // It stopped working between the read and the claim
                var now = await _shareLinkRepository.GetAsync(link.Token);
                return now is not null &&
                       ShareLinks.StateOf(now, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) == ShareLinkState.Expired
                    ? Error(HttpStatusCode.Gone, ExpiredMessage, "Gone")
                    : Error(HttpStatusCode.NotFound, UnavailableMessage, "Not Found");
            }

            if (item.Kind == ShareLinkKind.Track)
                await _sharedTrackRepository.ShareTrackAsync(item.Id, item.Owner, [username], [], link.Caption,
                    notifyRecipients: false);
            else
                await _albumShareRepository.ShareAlbumAsync(item.Id, item.Owner, [username], [], link.Caption,
                    notifyRecipients: false);

            return response;
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in AcceptLinkLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
