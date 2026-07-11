using System.Net;
using System.Text.Json;
using Amazon.Lambda.Annotations;
using Amazon.Lambda.Annotations.APIGateway;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;
using Amazon.StepFunctions;
using Amazon.StepFunctions.Model;
using Domain;
using Lambda.Shared;
using Ports;

namespace UploadTrackLambda;

public sealed class Function : BaseLambdaFunctionHandler
{
    private readonly ITrackValidationService _trackValidationService;
    private readonly IUserRepository _userRepository;
    private readonly IUploadStatusRepository _uploadStatusRepository;
    private readonly IAmazonStepFunctions _stepFunctions;
    private readonly string _stateMachineArn;

    public Function(
        ITrackValidationService trackValidationService,
        IUserRepository userRepository,
        IUploadStatusRepository uploadStatusRepository,
        IAmazonStepFunctions stepFunctions)
    {
        _trackValidationService = trackValidationService;
        _userRepository = userRepository;
        _uploadStatusRepository = uploadStatusRepository;
        _stepFunctions = stepFunctions;
        _stateMachineArn = Environment.GetEnvironmentVariable("STATE_MACHINE_ARN")
            ?? throw new InvalidOperationException("STATE_MACHINE_ARN environment variable is required");
    }

    [LambdaFunction]
    [HttpApi(LambdaHttpMethod.Post, "/tracks/upload")]
    public async Task<APIGatewayHttpApiV2ProxyResponse> FunctionHandler(
        APIGatewayHttpApiV2ProxyRequest request,
        ILambdaContext context,
        [FromBody] UploadTrackRequest uploadRequest)
    {
        var username = request.RequestContext.Authorizer.Jwt.Claims["cognito:username"];

        try
        {
            var input = new ProcessTrackInput(uploadRequest, username);

            await _trackValidationService.ValidateAsync(input);
            input.SharedWith = await _userRepository.GetValidatedRecipientsAsync(input.SharedWith, username);

            // Missing/oversized files fail here as a 400 (via the ArgumentException
            // catch) instead of crashing processing against its /tmp limit
            await _trackValidationService.ValidateUploadedAudioAsync(input.AudioKey!);

            input.TrackId = Guid.NewGuid().ToString("N").ToLowerInvariant();

            // Status record first: the client polls GET /tracks/uploads/{trackId}, so
            // PROCESSING must be visible before the state machine can win the race
            await _uploadStatusRepository.CreateProcessingAsync(username, input.TrackId);

            await _stepFunctions.StartExecutionAsync(new StartExecutionRequest
            {
                StateMachineArn = _stateMachineArn,
                Input = JsonSerializer.Serialize(input, CustomJsonSerializerContext.Default.ProcessTrackInput),
            });

            var response = new UploadStatus
            {
                TrackId = input.TrackId,
                Status = UploadState.Processing,
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            return Accepted(JsonSerializer.Serialize(response, CustomJsonSerializerContext.Default.UploadStatus));
        }
        catch (ArgumentException ex)
        {
            return Error(HttpStatusCode.BadRequest, ex.Message, "Bad Request");
        }
        catch (Exception ex)
        {
            context.Logger.LogError($"Error in UploadTrackLambda: {ex.Message}");
            return Error(HttpStatusCode.InternalServerError, ex.Message, "Internal Server Error");
        }
    }
}
