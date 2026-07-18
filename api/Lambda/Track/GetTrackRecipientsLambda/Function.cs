using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetTrackRecipientsLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/tracks/{trackId}/recipients")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var items = await _sharedTrackRepository.GetTrackRecipientDetailsAsync(track.Id);

            var response = new RecipientsResponse { Items = items };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.RecipientsResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetTrackRecipientsLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
