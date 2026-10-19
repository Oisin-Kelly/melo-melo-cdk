using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;

namespace Lambda.Tests.Support;

// Builds the API Gateway (HTTP API v2) request a handler receives after the Cognito JWT authorizer,
// and reads its response. Path params and the [FromBody] body are passed straight to FunctionHandler,
// so only the caller identity and the query string live on the request.
public static class Http
{
    public static APIGatewayHttpApiV2ProxyRequest As(string username, Dictionary<string, string>? query = null) =>
        Build(new Dictionary<string, string> { ["cognito:username"] = username }, query);

    // No usable identity claim — what the handler sees if the authorizer ever let one through
    public static APIGatewayHttpApiV2ProxyRequest Anonymous(Dictionary<string, string>? query = null) =>
        Build(new Dictionary<string, string>(), query);

    private static APIGatewayHttpApiV2ProxyRequest Build(Dictionary<string, string> claims,
        Dictionary<string, string>? query) => new()
    {
        RequestContext = new APIGatewayHttpApiV2ProxyRequest.ProxyRequestContext
        {
            Authorizer = new APIGatewayHttpApiV2ProxyRequest.AuthorizerDescription
            {
                Jwt = new APIGatewayHttpApiV2ProxyRequest.AuthorizerDescription.JwtDescription { Claims = claims },
            },
        },
        QueryStringParameters = query,
    };
}

public static class ResponseExtensions
{
    public static JsonElement Json(this APIGatewayHttpApiV2ProxyResponse response) =>
        JsonDocument.Parse(response.Body).RootElement;

    // Asserts the status, and for errors the ErrorResponse envelope's statusCode matches it
    public static APIGatewayHttpApiV2ProxyResponse ShouldHaveStatus(this APIGatewayHttpApiV2ProxyResponse response,
        HttpStatusCode expected)
    {
        response.StatusCode.Should().Be((int)expected, "body was: {0}", response.Body);
        if ((int)expected >= 400 && !string.IsNullOrEmpty(response.Body))
            response.Json().GetProperty("statusCode").GetInt32().Should().Be((int)expected);
        return response;
    }

    public static string ErrorMessage(this APIGatewayHttpApiV2ProxyResponse response) =>
        response.Json().GetProperty("message").GetString()!;
}
