using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Domain;
using Lambda.Shared;
using Ports.Repositories;
using Ports.Validation;

namespace SetAlbumTracksLambda;

public record SetAlbumTracksResponse
{
    [JsonPropertyName("trackCount")] public required int TrackCount { get; set; }
    [JsonPropertyName("added")] public required int Added { get; set; }
    [JsonPropertyName("removed")] public required int Removed { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumValidationService _albumValidationService;

    public Function(IAlbumRepository albumRepository, IAlbumValidationService albumValidationService)
    {
        _albumRepository = albumRepository;
        _albumValidationService = albumValidationService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Put, "/albums/{albumId}/tracks")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId,
        [FromBody] SetAlbumTracksRequest setRequest)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            setRequest = await _albumValidationService.ValidateSetTracksAsync(username, setRequest);

            // Declarative save: the submitted list becomes the tracklist in that
            // order — new ids fan out grants to existing recipients, dropped
            // members have their album-derived grants revoked
            var (added, removed) = await _albumRepository.SetTracksAsync(album.Id, username, setRequest.TrackIds);

            var response = new SetAlbumTracksResponse
            {
                TrackCount = setRequest.TrackIds.Count,
                Added = added,
                Removed = removed,
            };

            return Ok(JsonSerializer.Serialize(response,
                CustomJsonSerializerContext.Default.SetAlbumTracksResponse));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in SetAlbumTracksLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}