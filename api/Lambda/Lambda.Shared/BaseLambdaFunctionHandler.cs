using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;

namespace Lambda.Shared;

public abstract class BaseLambdaFunctionHandler
{
    protected static APIGatewayHttpApiV2ProxyResponse Error(HttpStatusCode code, string message, string error)
    {
        return JsonResponse(code,
            JsonSerializer.Serialize(new ErrorResponse { StatusCode = (int)code, Message = message, Error = error },
                CustomJsonSerializerContext.Default.ErrorResponse));
    }

    protected static (string Username, APIGatewayHttpApiV2ProxyResponse? Error) GetCallerUsername(
        APIGatewayHttpApiV2ProxyRequest request)
    {
        var claims = request.RequestContext?.Authorizer?.Jwt?.Claims;
        if (claims is not null && claims.TryGetValue("cognito:username", out var username) &&
            !string.IsNullOrWhiteSpace(username))
            return (username, null);

        return (string.Empty, Error(HttpStatusCode.Unauthorized, "Unauthorized", "Unauthorized"));
    }

    protected static int ParseLimit(IDictionary<string, string>? query, int defaultValue = 10, int max = 100)
    {
        if (query is null || !query.TryGetValue("limit", out var raw) || !int.TryParse(raw, out var limit))
            return defaultValue;

        return Math.Clamp(limit, 1, max);
    }

    protected static APIGatewayHttpApiV2ProxyResponse Ok(string body) =>
        JsonResponse(HttpStatusCode.OK, body);

    protected static APIGatewayHttpApiV2ProxyResponse Created(string body) =>
        JsonResponse(HttpStatusCode.Created, body);

    protected static APIGatewayHttpApiV2ProxyResponse Accepted(string body) =>
        JsonResponse(HttpStatusCode.Accepted, body);

    private static APIGatewayHttpApiV2ProxyResponse JsonResponse(HttpStatusCode code, string body)
    {
        return new APIGatewayHttpApiV2ProxyResponse
        {
            StatusCode = (int)code,
            Body = body,
            Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } }
        };
    }
}
