using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetUploadsLambda;

// The caller's uploads that haven't become tracks: still processing, or failed (with the
// reason). Finished ones are left out — they're in GET /tracks now.
public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IUploadStatusRepository _uploadStatusRepository;

    public Function(IUploadStatusRepository uploadStatusRepository)
    {
        _uploadStatusRepository = uploadStatusRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/uploads")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            var uploads = await _uploadStatusRepository.GetUnfinishedAsync(username);
            return Ok(JsonSerializer.Serialize(new UploadStatusList { Items = uploads },
                GetUploadsJsonContext.Default.UploadStatusList));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetUploadsLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
