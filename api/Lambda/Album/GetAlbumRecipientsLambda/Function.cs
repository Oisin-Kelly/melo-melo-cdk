using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;

namespace GetAlbumRecipientsLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;

    public Function(IAlbumRepository albumRepository)
    {
        _albumRepository = albumRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Get, "/albums/{albumId}/recipients")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            var items = await _albumRepository.GetAlbumRecipientDetailsAsync(album.Id);

            var response = new RecipientsResponse { Items = items };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.RecipientsResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in GetAlbumRecipientsLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
