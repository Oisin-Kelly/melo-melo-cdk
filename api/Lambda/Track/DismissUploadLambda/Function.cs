using System.Net;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace DismissUploadLambda;

// Clears a failed upload from the caller's list (GET /tracks/uploads). Idempotent: an
// unknown or already-dismissed id is a 200 too. One still processing can't be dismissed.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUploadStatusRepository _uploadStatusRepository;

    public Function(IUploadStatusRepository uploadStatusRepository)
    {
        _uploadStatusRepository = uploadStatusRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Delete, "/tracks/uploads/{trackId}")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            if (!await _uploadStatusRepository.DismissAsync(username, trackId))
                return Error(HttpStatusCode.BadRequest, "This upload is still processing.", "Bad Request");

            return Ok("{\"message\":\"Upload dismissed.\"}");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in DismissUploadLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
