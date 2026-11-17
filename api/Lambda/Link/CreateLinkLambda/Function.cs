using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Adapters.Validation;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Services;

namespace CreateLinkLambda;

// A new share link for one of the caller's own tracks or albums. Anyone holding it can add the
// item to their library until it expires or is revoked. Not yours → the usual 404.
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
    [HttpApi(LambdaHttpMethod.Post, "/links")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        [FromBody] CreateShareLinkRequest createRequest)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var kind = createRequest.Kind?.Trim().ToUpperInvariant();
            if (kind is not (ShareLinkKind.Track or ShareLinkKind.Album) ||
                string.IsNullOrWhiteSpace(createRequest.TargetId))
                return Error(HttpStatusCode.BadRequest, "kind must be TRACK or ALBUM, with a targetId",
                    "Bad Request");

            var expiresIn = ShareLinks.ExpiryFor(createRequest.ExpiresIn);
            if (expiresIn is null)
                return Error(HttpStatusCode.BadRequest,
                    $"expiresIn must be one of {string.Join(", ", ShareLinks.ExpiryOptions)}", "Bad Request");

            // Sanitised like a share's caption, which it becomes on accept
            var caption = InputSanitiser.MultiLine(createRequest.Caption);
            if (caption?.Length > ShareLinks.MaxCaptionLength)
                return Error(HttpStatusCode.BadRequest,
                    $"caption must be at most {ShareLinks.MaxCaptionLength} characters", "Bad Request");

            var item = await _linkTargetService.GetAsync(kind, createRequest.TargetId.Trim());
            if (item is null || item.Owner != username)
                return Error(HttpStatusCode.NotFound, $"no {kind.ToLowerInvariant()} found by id {createRequest.TargetId}",
                    "Not Found");

            var link = await _shareLinkRepository.CreateAsync(username, kind, item.Id, expiresIn.Value, caption);

            var response = ShareLinks.ToShareLink(link, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            return Created(JsonSerializer.Serialize(response, CreateLinkJsonContext.Default.ShareLink));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in CreateLinkLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
