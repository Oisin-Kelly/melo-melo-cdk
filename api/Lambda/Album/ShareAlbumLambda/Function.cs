using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Lambda.Shared;
using Ports.Repositories;

namespace ShareAlbumLambda;

public record ShareAlbumRequest
{
    [JsonPropertyName("add")] public List<string> Add { get; set; } = [];
    [JsonPropertyName("remove")] public List<string> Remove { get; set; } = [];
}

public record ShareAlbumResponse
{
    [JsonPropertyName("sharedWith")] public required List<string> SharedWith { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxRecipientsPerAlbum = 50;

    private readonly IAlbumRepository _albumRepository;
    private readonly IUserRepository _userRepository;

    public Function(IAlbumRepository albumRepository, IUserRepository userRepository)
    {
        _albumRepository = albumRepository;
        _userRepository = userRepository;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/albums/{albumId}/share")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string albumId,
        [FromBody] ShareAlbumRequest shareRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            if (shareRequest.Add.Count == 0 && shareRequest.Remove.Count == 0)
                return Error(HttpStatusCode.BadRequest, "provide at least one user in add or remove", "Bad Request");

            var album = await _albumRepository.GetAlbumByIdAsync(albumId);
            if (album is null || album.OwnerUsername != username)
                return Error(HttpStatusCode.NotFound, $"no album found by id {albumId}", "Not Found");

            var currentRecipients = await _albumRepository.GetAlbumRecipientsAsync(album.Id);

            // Strips self, duplicates, and unknown usernames
            var validatedAdds = await _userRepository.GetValidatedRecipientsAsync(shareRequest.Add, username);
            var addRecipients = validatedAdds.Except(currentRecipients, StringComparer.OrdinalIgnoreCase).ToList();

            var removeRecipients = shareRequest.Remove
                .Where(u => currentRecipients.Contains(u, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var totalAfter = currentRecipients.Count + addRecipients.Count - removeRecipients.Count;
            if (totalAfter > MaxRecipientsPerAlbum)
                return Error(HttpStatusCode.BadRequest,
                    $"albums can be shared with at most {MaxRecipientsPerAlbum} users", "Bad Request");

            await _albumRepository.ShareAlbumAsync(album.Id, username, addRecipients, removeRecipients);

            var sharedWith = currentRecipients
                .Except(removeRecipients, StringComparer.OrdinalIgnoreCase)
                .Union(addRecipients, StringComparer.OrdinalIgnoreCase)
                .OrderBy(u => u)
                .ToList();

            var response = new ShareAlbumResponse { SharedWith = sharedWith };
            return Ok(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.ShareAlbumResponse));
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ShareAlbumLambda. Error: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
