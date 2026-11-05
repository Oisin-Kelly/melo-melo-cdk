using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace GetLinkPreviewLambda;

// The invite screen behind a share link. PUBLIC — the route has no authorizer, because whoever
// opens a link may not have an account yet — so it shows only what the link's holder is meant to
// see, and always answers 200 with a state:
//   VALID       sender, the item's name/cover/meta, and (if the owner allowed it) what can be
//               played: a 30s clip per track, or the whole track when it's 30s or shorter
//   EXPIRED     only the sender and kind ("Oisín shared a track with you, but…")
//   UNAVAILABLE nothing at all — revoked, unknown, or the item was deleted look identical
public sealed class Function : BaseLambdaFunctionHandler
{
    // Short, because a revoked link can't take back a URL it already handed out
    private static readonly TimeSpan PreviewUrlExpiry = TimeSpan.FromMinutes(10);

    private readonly IShareLinkRepository _shareLinkRepository;
    private readonly ILinkTargetService _linkTargetService;
    private readonly IUserRepository _userRepository;
    private readonly IAudioService _audioService;

    public Function(IShareLinkRepository shareLinkRepository, ILinkTargetService linkTargetService,
        IUserRepository userRepository, IAudioService audioService)
    {
        _shareLinkRepository = shareLinkRepository;
        _linkTargetService = linkTargetService;
        _userRepository = userRepository;
        _audioService = audioService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/links/{token}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string token)
    {
        try
        {
            var preview = await BuildAsync(token);
            return Ok(JsonSerializer.Serialize(preview, GetLinkPreviewJsonContext.Default.LinkPreview));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLinkPreviewLambda. Error: {ex.Message}");
            return InternalError();
        }
    }

    private static readonly LinkPreview Unavailable = new() { State = LinkPreviewState.Unavailable };

    private async Task<LinkPreview> BuildAsync(string token)
    {
        var link = await _shareLinkRepository.GetAsync(token);
        if (link is null)
            return Unavailable;

        var state = ShareLinks.StateOf(link, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        if (state == ShareLinkState.Revoked)
            return Unavailable;

        var item = await _linkTargetService.GetAsync(link.Kind, link.TargetId);
        var sender = item is null ? null : await _userRepository.GetUserByUsername(item.Owner);
        if (item is null || sender is null)
            return Unavailable;

        if (state == ShareLinkState.Expired)
            return new LinkPreview
            {
                State = LinkPreviewState.Expired,
                Kind = item.Kind,
                Sender = UserSummary.From(sender),
                ExpiresAt = link.LinkExpiresAt,
            };

        var tracks = await Task.WhenAll(item.Tracks.Select(async t => new LinkPreviewTrack
        {
            Id = t.Id,
            Name = t.Name,
            Duration = t.Duration,
            Preview = link.AllowPreview ? await _audioService.GetPreviewAsync(t, PreviewUrlExpiry) : null,
        }));

        return new LinkPreview
        {
            State = LinkPreviewState.Valid,
            Kind = item.Kind,
            Sender = UserSummary.From(sender),
            Name = item.Name,
            ImageUrl = item.ImageUrl,
            ImageBgColor = item.ImageBgColor,
            Genre = item.Genre,
            Duration = item.Duration,
            ExpiresAt = link.LinkExpiresAt,
            AllowPreview = link.AllowPreview,
            Caption = link.Caption,
            Tracks = tracks.ToList(),
        };
    }
}
