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

namespace GetLinksLambda;

// The share links of one of the caller's tracks or albums, newest first, expired and revoked ones
// included (each carries its state). Not yours → the usual 404.
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
    [HttpApi(LambdaHttpMethod.Get, "/links")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? kind = null, targetId = null;
        request.QueryStringParameters?.TryGetValue("kind", out kind);
        request.QueryStringParameters?.TryGetValue("targetId", out targetId);
        kind = kind?.Trim().ToUpperInvariant();

        if (kind is not (ShareLinkKind.Track or ShareLinkKind.Album) || string.IsNullOrWhiteSpace(targetId))
            return Error(HttpStatusCode.BadRequest, "kind must be TRACK or ALBUM, with a targetId", "Bad Request");

        try
        {
            var item = await _linkTargetService.GetAsync(kind, targetId.Trim());
            if (item is null || item.Owner != username)
                return Error(HttpStatusCode.NotFound, $"no {kind.ToLowerInvariant()} found by id {targetId}",
                    "Not Found");

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var links = await _shareLinkRepository.ListForTargetAsync(kind, item.Id);

            var response = new ShareLinkList { Items = links.Select(l => ShareLinks.ToShareLink(l, now)).ToList() };
            return Ok(JsonSerializer.Serialize(response, GetLinksJsonContext.Default.ShareLinkList));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetLinksLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
