using System.Net;
using Amazon.S3;
using Domain;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Ports;

namespace Adapters;

internal class TrackValidator : AbstractValidator<ProcessTrackInput>
{
    public TrackValidator()
    {
        RuleFor(x => x.TrackTitle)
            .NotEmpty()
            .MaximumLength(100);
        RuleFor(x => x.AudioKey)
            .NotEmpty()
            .MaximumLength(1000);
        RuleFor(x => x.Description)
            .MaximumLength(4000);
        RuleFor(x => x.Genre)
            .MaximumLength(35);
        RuleFor(x => x.Caption)
            .MaximumLength(300);
        RuleFor(x => x.SharedWith)
            .Must(x => x.Count <= 50).WithMessage("sharedWith cannot exceed 50 recipients.");
    }
}

internal class UpdateTrackValidator : AbstractValidator<UpdateTrackRequest>
{
    public UpdateTrackValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("name is required")
            .MaximumLength(100).WithMessage("name must be at most 100 characters");
        RuleFor(x => x.Genre)
            .MaximumLength(35).WithMessage("genre must be at most 35 characters");
        RuleFor(x => x.Description)
            .MaximumLength(4000).WithMessage("description must be at most 4000 characters");
    }
}

internal class ShareTrackValidator : AbstractValidator<ShareTrackRequest>
{
    public ShareTrackValidator()
    {
        RuleFor(x => x)
            .Must(x => x.Add.Count > 0 || x.Remove.Count > 0)
            .WithMessage("provide at least one user in add or remove");
        RuleFor(x => x.Caption)
            .MaximumLength(300).WithMessage("caption must be at most 300 characters");
    }
}

public sealed class TrackValidationService : ITrackValidationService
{
    private const long MaxAudioBytes = 300L * 1024 * 1024;

    private static readonly TrackValidator Validator = new();
    private static readonly UpdateTrackValidator UpdateValidator = new();
    private static readonly ShareTrackValidator ShareValidator = new();

    private readonly IS3Service _dropboxS3Service;

    public TrackValidationService([FromKeyedServices("Dropbox")] IS3Service dropboxS3Service)
    {
        _dropboxS3Service = dropboxS3Service;
    }

    public Task<ProcessTrackInput> ValidateAsync(ProcessTrackInput input)
    {
        input.TrackTitle = InputSanitiser.SingleLine(input.TrackTitle);
        input.Description = InputSanitiser.MultiLine(input.Description);
        input.Genre = InputSanitiser.SingleLine(input.Genre);
        input.Caption = InputSanitiser.MultiLine(input.Caption);

        var result = Validator.Validate(input);

        if (result.IsValid)
            return Task.FromResult(input);

        var errorMessages = result.Errors.Select(x => x.ErrorMessage);
        throw new ArgumentException(string.Join(" ", errorMessages));
    }

    public UpdateTrackRequest ValidateUpdate(UpdateTrackRequest request)
    {
        request.Name = InputSanitiser.SingleLine(request.Name);
        request.Genre = InputSanitiser.SingleLine(request.Genre);
        request.Description = InputSanitiser.MultiLine(request.Description);

        var result = UpdateValidator.Validate(request);
        if (result.IsValid)
            return request;

        throw new ArgumentException(string.Join(" ", result.Errors.Select(x => x.ErrorMessage)));
    }

    public ShareTrackRequest ValidateShare(ShareTrackRequest request)
    {
        request.Caption = InputSanitiser.MultiLine(request.Caption);

        var result = ShareValidator.Validate(request);
        if (result.IsValid)
            return request;

        throw new ArgumentException(string.Join(" ", result.Errors.Select(x => x.ErrorMessage)));
    }

    public async Task ValidateUploadedAudioAsync(string audioKey)
    {
        try
        {
            var metadata = await _dropboxS3Service.GetObjectMetadata(audioKey);

            if (metadata.Headers.ContentLength > MaxAudioBytes)
                throw new ArgumentException(
                    $"Audio file exceeds the {MaxAudioBytes / (1024 * 1024)} MB limit.");
        }
        catch (AmazonS3Exception s3Ex) when (s3Ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new ArgumentException($"No uploaded audio found at '{audioKey}'.");
        }
    }
}
