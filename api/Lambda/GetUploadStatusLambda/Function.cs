using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetUploadStatusLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUploadStatusRepository _uploadStatusRepository;

    public Function(IUploadStatusRepository uploadStatusRepository)
    {
        _uploadStatusRepository = uploadStatusRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/uploads/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var status = await _uploadStatusRepository.GetAsync(username, trackId);
            if (status is null)
                return Error(HttpStatusCode.NotFound, $"no upload found by id {trackId}", "Not Found");

            return Ok(JsonSerializer.Serialize(status, CustomJsonSerializerContext.Default.UploadStatus));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUploadStatusLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
