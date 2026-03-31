using System.Net;
using System.Text.Json;
using Amazon.Lambda.APIGatewayEvents;

namespace Lambda.Shared;

public abstract class BaseLambdaFunctionHandler
{
    protected static APIGatewayHttpApiV2ProxyResponse Error(HttpStatusCode code, string message, string error)
    {
        return new APIGatewayHttpApiV2ProxyResponse
        {
            StatusCode = (int)code,
            Body = JsonSerializer.Serialize(new ErrorResponse((int)code, message, error), CustomJsonSerializerContext.Default.ErrorResponse),
            Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } }
        };
    }

    protected static APIGatewayHttpApiV2ProxyResponse Ok(string body)
    {
        return new APIGatewayHttpApiV2ProxyResponse
        {
            StatusCode = (int)HttpStatusCode.OK,
            Body = body,
            Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } }
        };
    }
}