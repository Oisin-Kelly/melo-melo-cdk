using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace GetProgressLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IProgressRepository _progressRepository;

    public Function(IProgressRepository progressRepository)
    {
        _progressRepository = progressRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/me/progress")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var progress = await _progressRepository.GetResolvableAsync(username);
            if (progress is null)
                return new APIGatewayHttpApiV2ProxyResponse { StatusCode = (int)HttpStatusCode.NoContent };

            return Ok(JsonSerializer.Serialize(progress, CustomJsonSerializerContext.Default.ProgressEntry));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetProgressLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
