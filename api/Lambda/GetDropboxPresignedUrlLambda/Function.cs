using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports;

namespace GetDropboxPresignedUrlLambda;

public record PresignedUrlResponse
{
    [JsonPropertyName("url")] public required string Url { get; init; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IS3Service _dropboxS3Service;

    public Function(IS3Service dropboxS3Service)
    {
        _dropboxS3Service = dropboxS3Service;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/buckets/dropbox")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context)
    {
        var key = request.QueryStringParameters?["key"];

        if (string.IsNullOrWhiteSpace(key))
            return Error(HttpStatusCode.BadRequest, "the query parameter 'key' is required", "Bad Request");

        try
        {
            var url = await _dropboxS3Service.GetPresignedPutUrlAsync(key, TimeSpan.FromHours(1));

            return Ok(
                JsonSerializer.Serialize(
                    new PresignedUrlResponse { Url = url },
                    CustomJsonSerializerContext.Default.PresignedUrlResponse
                )
            );
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetDropboxPresignedUrlLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
