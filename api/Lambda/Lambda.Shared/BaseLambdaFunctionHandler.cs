using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;

namespace Lambda.Shared;

public abstract class BaseLambdaFunctionHandler
{
    protected static APIGatewayHttpApiV2ProxyResponse Error(HttpStatusCode code, string message, string error)
    {
        return JsonResponse(code,
            JsonSerializer.Serialize(new ErrorResponse((int)code, message, error),
                CustomJsonSerializerContext.Default.ErrorResponse));
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
