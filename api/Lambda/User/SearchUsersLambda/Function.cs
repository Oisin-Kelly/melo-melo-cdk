using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace SearchUsersLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUserRepository _userRepository;

    public Function(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    // GET /users/search?q=&limit=&cursor= — case-insensitive username prefix search
    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/users/search")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var query = request.QueryStringParameters ?? new Dictionary<string, string>();

        query.TryGetValue("q", out var q);
        query.TryGetValue("cursor", out var cursor);
        var limit = ParseLimit(query);

        q = q?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(q))
            return Error(HttpStatusCode.BadRequest, "the query parameter 'q' is required", "Bad Request");

        // Same charset as usernames — anything else can't match a prefix anyway
        if (!q.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_'))
            return Error(HttpStatusCode.BadRequest, "q may only contain letters, digits, '.' and '_'", "Bad Request");

        try
        {
            var result = await _userRepository.SearchUsersAsync(q, limit, cursor);

            return Ok(
                JsonSerializer.Serialize(
                    result,
                    CustomJsonSerializerContext.Default.PaginatedResultUserSummary
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in SearchUsersLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
