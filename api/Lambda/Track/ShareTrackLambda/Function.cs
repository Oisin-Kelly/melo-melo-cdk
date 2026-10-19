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

namespace ShareTrackLambda;

public record ShareTrackResponse
{
    [JsonPropertyName("sharedWith")] public required List<string> SharedWith { get; set; }
}

public sealed class Function : BaseLambdaFunctionHandler
{
    private const int MaxRecipientsPerTrack = 50;

    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IUserRepository _userRepository;
    private readonly ITrackValidationService _trackValidationService;

    public Function(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository,
        IUserRepository userRepository, ITrackValidationService trackValidationService)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _userRepository = userRepository;
        _trackValidationService = trackValidationService;
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/tracks/{trackId}/share")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        string trackId,
        [FromBody] ShareTrackRequest shareRequest)
    {
        var (username, authError) = GetCallerUsername(request);

        if (authError is not null) return authError;

        try
        {
            shareRequest = _trackValidationService.ValidateShare(shareRequest);

            var track = await _trackRepository.GetTrackAsync(trackId);
            if (track is null || track.Owner.Username != username)
                return Error(HttpStatusCode.NotFound, $"no track found by id {trackId}", "Not Found");

            var currentRecipients = await _sharedTrackRepository.GetTrackRecipientsAsync(track.Id);

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
            if (totalAfter > MaxRecipientsPerTrack)
                return Error(HttpStatusCode.BadRequest,
                    $"tracks can be shared with at most {MaxRecipientsPerTrack} users", "Bad Request");

            await _sharedTrackRepository.ShareTrackAsync(track.Id, username, validatedAdds, removeRecipients,
                shareRequest.Caption);

            var sharedWith = currentRecipients
                .Except(removeRecipients, StringComparer.OrdinalIgnoreCase)
                .Union(validatedAdds, StringComparer.OrdinalIgnoreCase)
                .OrderBy(u => u)
                .ToList();

            var response = new ShareTrackResponse { SharedWith = sharedWith };
            return Ok(JsonSerializer.Serialize(response, ShareTrackJsonContext.Default.ShareTrackResponse));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error occured in ShareTrackLambda. Error: {ex.Message}");
            return InternalError();
        }
    }
}
