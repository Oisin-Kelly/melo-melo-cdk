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

namespace ShareAlbumLambda;

public record ShareAlbumResponse
{
    [JsonPropertyName("sharedWith")] public required List<string> SharedWith { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxRecipientsPerAlbum = 50;

    private readonly IAlbumRepository _albumRepository;
    private readonly IUserRepository _userRepository;
    private readonly IAlbumValidationService _albumValidationService;

    public Function(IAlbumRepository albumRepository, IUserRepository userRepository,
        IAlbumValidationService albumValidationService)
    {
        _albumRepository = albumRepository;
        _userRepository = userRepository;
        _albumValidationService = albumValidationService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/albums/{albumId}/share")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId,
        [FromBody] ShareAlbumRequest shareRequest)
    {
        var (username, authError) = GetCallerUsername(request);
        if (authError is not null) return authError;

        try
        {
            shareRequest = _albumValidationService.ValidateShare(shareRequest);

            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            var currentRecipients = await _albumRepository.GetAlbumRecipientsAsync(album.Id);

            // Strips self, duplicates, and unknown usernames
            var validatedAdds = await _userRepository.GetValidatedRecipientsAsync(shareRequest.Add, username);

            var removeRecipients = shareRequest.Remove
                .Where(u => currentRecipients.Contains(u, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var newRecipients = validatedAdds.Except(currentRecipients, StringComparer.OrdinalIgnoreCase).ToList();
            var totalAfter = currentRecipients.Count + newRecipients.Count - removeRecipients.Count;
            if (totalAfter > MaxRecipientsPerAlbum)
                return Error(HttpStatusCode.BadRequest,
                    $"albums can be shared with at most {MaxRecipientsPerAlbum} users", "Bad Request");

            await _albumRepository.ShareAlbumAsync(album.Id, username, validatedAdds, removeRecipients,
                shareRequest.Caption);

            var sharedWith = currentRecipients
                .Except(removeRecipients, StringComparer.OrdinalIgnoreCase)
                .Union(validatedAdds, StringComparer.OrdinalIgnoreCase)
                .OrderBy(u => u)
                .ToList();

            var response = new ShareAlbumResponse { SharedWith = sharedWith };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.ShareAlbumResponse));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ShareAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
