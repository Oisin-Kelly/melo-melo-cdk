using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace RevokeLinkLambda;

// Stops new people joining through the link. People who already accepted keep access (the owner
// removes them from the people list). Idempotent.
// Only the link's owner; anyone else gets the same 404 as an unknown link.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IShareLinkRepository _shareLinkRepository;

    public Function(IShareLinkRepository shareLinkRepository)
    {
        _shareLinkRepository = shareLinkRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/links/{token}")]
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
            if (link is null || link.Owner != username)
                return Error(HttpStatusCode.NotFound, "no link found", "Not Found");

            await _shareLinkRepository.RevokeAsync(link.Token);

            var updated = await _shareLinkRepository.GetAsync(link.Token) ?? link;
            var response = ShareLinks.ToShareLink(updated, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            return Ok(JsonSerializer.Serialize(response, RevokeLinkJsonContext.Default.ShareLink));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in RevokeLinkLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
