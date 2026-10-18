using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Services;

namespace GetDropboxPresignedUrlLambda;

public record PresignedUrlResponse
{
    [JsonPropertyName("url")] public required string Url { get; init; }

    // The staged key to send back as audioKey/imageKey — the requested key under
    // the caller's own prefix ({username}/{key})
    [JsonPropertyName("key")] public required string Key { get; init; }
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
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        string? key = null;
        request.QueryStringParameters?.TryGetValue("key", out key);

        if (string.IsNullOrWhiteSpace(key))
            return Error(HttpStatusCode.BadRequest, "the query parameter 'key' is required", "Bad Request");

        try
        {
            var stagedKey = DropboxKeys.ForUser(username, key);
            var url = await _dropboxS3Service.GetPresignedPutUrlAsync(stagedKey, TimeSpan.FromHours(1));

            return Ok(
                JsonSerializer.Serialize(
                    new PresignedUrlResponse { Url = url, Key = stagedKey },
                    CustomJsonSerializerContext.Default.PresignedUrlResponse
                )
            );
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetDropboxPresignedUrlLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
