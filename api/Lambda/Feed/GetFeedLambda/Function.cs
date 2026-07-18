using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetFeedLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int PageSize = 10;

    private readonly IFeedRepository _feedRepository;

    public Function(IFeedRepository feedRepository)
    {
        _feedRepository = feedRepository;
    }

    // GET /feed?cursor=&type=TRACK|ALBUM&sort=asc|desc
    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/feed")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;
        var query = request.QueryStringParameters ?? new Dictionary<string, string>();

        query.TryGetValue("cursor", out var cursor);
        query.TryGetValue("type", out var type);
        query.TryGetValue("sort", out var sort);

        try
        {
            type = type?.Trim().ToUpperInvariant();
            if (type is not null && !FeedItemType.All.Contains(type))
                return Error(HttpStatusCode.BadRequest, "type must be TRACK or ALBUM", "Bad Request");

            var ascending = string.Equals(sort, "asc", StringComparison.OrdinalIgnoreCase);

            var result = await _feedRepository.GetFeedAsync(username, type, ascending, PageSize, cursor);
            return Ok(JsonSerializer.Serialize(result, CustomJsonSerializerContext.Default.PaginatedResultFeedEntry));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetFeedLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
