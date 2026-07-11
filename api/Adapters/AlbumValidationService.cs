using Domain;
using FluentValidation;
using Ports;

namespace Adapters;

internal class CreateAlbumValidator : AbstractValidator<CreateAlbumRequest>
{
    public CreateAlbumValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("name is required and must be at most 100 characters")
            .MaximumLength(100).WithMessage("name is required and must be at most 100 characters");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("description must be at most 1000 characters");
        RuleFor(x => x.TrackIds)
            .Must(x => x.Count <= AlbumValidationService.MaxTracksPerAlbum)
            .WithMessage($"albums can hold at most {AlbumValidationService.MaxTracksPerAlbum} tracks");
    }
}

internal class UpdateAlbumValidator : AbstractValidator<UpdateAlbumRequest>
{
    public UpdateAlbumValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(100).WithMessage("name must be at most 100 characters");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("description must be at most 1000 characters");
    }
}

public sealed class AlbumValidationService : IAlbumValidationService
{
    public const int MaxTracksPerAlbum = 50;

    private static readonly CreateAlbumValidator CreateValidator = new();
    private static readonly UpdateAlbumValidator UpdateValidator = new();

    public CreateAlbumRequest ValidateCreate(CreateAlbumRequest request)
    {
        request.Name = InputSanitiser.SingleLine(request.Name);
        request.Description = InputSanitiser.MultiLine(request.Description);
        request.TrackIds = request.TrackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .ToList();

        ThrowIfInvalid(CreateValidator.Validate(request));
        return request;
    }

    public UpdateAlbumRequest ValidateUpdate(UpdateAlbumRequest request)
    {
        request.Name = InputSanitiser.SingleLine(request.Name);
        request.Description = InputSanitiser.MultiLine(request.Description);

        ThrowIfInvalid(UpdateValidator.Validate(request));
        return request;
    }

    private static void ThrowIfInvalid(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid)
            return;

        throw new ArgumentException(string.Join(" ", result.Errors.Select(x => x.ErrorMessage).Distinct()));
    }
}
