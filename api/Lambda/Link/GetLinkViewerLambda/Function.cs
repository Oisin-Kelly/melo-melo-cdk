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

namespace GetLinkViewerLambda;

// The signed-in viewer's relation to a link's item — OWN, ALREADY_HAVE or NONE — so the invite
// screen can show Open / Manage links instead of Add. A separate route from the public preview
// because an HTTP API route is either authorized or not. Revoked/unknown/deleted → 404.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IShareLinkRepository _shareLinkRepository;
    private readonly ILinkTargetService _linkTargetService;

    public Function(IShareLinkRepository shareLinkRepository, ILinkTargetService linkTargetService)
    {
        _shareLinkRepository = shareLinkRepository;
        _linkTargetService = linkTargetService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/links/{token}/viewer")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string token)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var link = await _shareLinkRepository.GetAsync(token);
            if (link is null || ShareLinks.StateOf(link, now) == ShareLinkState.Revoked)
                return Error(HttpStatusCode.NotFound, "This link isn't available", "Not Found");

            var item = await _linkTargetService.GetAsync(link.Kind, link.TargetId);
            if (item is null)
                return Error(HttpStatusCode.NotFound, "This link isn't available", "Not Found");

            var isOwner = item.Owner == username;
            var relation = isOwner ? LinkViewerRelation.Own
                : await _linkTargetService.HasAccessAsync(item, username) ? LinkViewerRelation.AlreadyHave
                : LinkViewerRelation.None;

            var response = new LinkViewer
            {
                Relation = relation,
                Target = new LinkTarget { Kind = item.Kind, Id = item.Id, Owner = item.Owner, Slug = item.Slug },
                Link = isOwner ? ShareLinks.ToShareLink(link, now) : null,
            };
            return Ok(JsonSerializer.Serialize(response, GetLinkViewerJsonContext.Default.LinkViewer));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLinkViewerLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
