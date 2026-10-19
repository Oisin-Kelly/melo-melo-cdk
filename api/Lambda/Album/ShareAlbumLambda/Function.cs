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
    private readonly IAlbumShareRepository _albumShareRepository;
    private readonly IUserRepository _userRepository;
    private readonly IAlbumValidationService _albumValidationService;

    public Function(IAlbumRepository albumRepository, IAlbumShareRepository albumShareRepository, IUserRepository userRepository,
        IAlbumValidationService albumValidationService)
    {
        _albumRepository = albumRepository;
        _albumShareRepository = albumShareRepository;
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

            var currentRecipients = await _albumShareRepository.GetAlbumRecipientsAsync(album.Id);

            // Strips self, duplicates, and unknown usernames. A user in both add and remove is
            // contradictory — remove wins, and that's decided here (against the raw remove list)
            // so the recipient cap and the sharedWith response agree with what gets written.
            var removeList = shareRequest.Remove
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Select(NormaliseUsername)
                .Distinct()
                .ToList();
            var removeRequested = removeList.ToHashSet();
            var validatedAdds = (await _userRepository.GetValidatedRecipientsAsync(shareRequest.Add, username))
                .Where(u => !removeRequested.Contains(u))
                .ToList();

            var removeRecipients = removeList.Where(currentRecipients.Contains).ToList();

            var newRecipients = validatedAdds.Except(currentRecipients).ToList();
            var totalAfter = currentRecipients.Count + newRecipients.Count - removeRecipients.Count;
            if (totalAfter > MaxRecipientsPerAlbum)
                return Error(HttpStatusCode.BadRequest,
                    $"albums can be shared with at most {MaxRecipientsPerAlbum} users", "Bad Request");

            await _albumShareRepository.ShareAlbumAsync(album.Id, username, validatedAdds, removeRecipients,
                shareRequest.Caption);

            var sharedWith = currentRecipients
                .Except(removeRecipients, StringComparer.OrdinalIgnoreCase)
                .Union(validatedAdds, StringComparer.OrdinalIgnoreCase)
                .OrderBy(u => u)
                .ToList();

            var response = new ShareAlbumResponse { SharedWith = sharedWith };
            return Ok(JsonSerializer.Serialize(response, ShareAlbumJsonContext.Default.ShareAlbumResponse));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ShareAlbumLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
