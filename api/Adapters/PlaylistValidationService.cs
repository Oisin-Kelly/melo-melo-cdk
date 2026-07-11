using Domain;
using FluentValidation;
using Ports;

namespace Adapters;

internal class CreatePlaylistValidator : AbstractValidator<CreatePlaylistRequest>
{
    public CreatePlaylistValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("name is required and must be at most 100 characters")
            .MaximumLength(100).WithMessage("name is required and must be at most 100 characters");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("description must be at most 1000 characters");
    }
}

internal class UpdatePlaylistValidator : AbstractValidator<UpdatePlaylistRequest>
{
    public UpdatePlaylistValidator()
    {
        RuleFor(x => x.Name)
            .MaximumLength(100).WithMessage("name must be at most 100 characters");
        RuleFor(x => x.Description)
            .MaximumLength(1000).WithMessage("description must be at most 1000 characters");
    }
}

public sealed class PlaylistValidationService : IPlaylistValidationService
{
    private static readonly CreatePlaylistValidator CreateValidator = new();
    private static readonly UpdatePlaylistValidator UpdateValidator = new();

    public CreatePlaylistRequest ValidateCreate(CreatePlaylistRequest request)
    {
        request.Name = InputSanitiser.SingleLine(request.Name);
        request.Description = InputSanitiser.MultiLine(request.Description);

        ThrowIfInvalid(CreateValidator.Validate(request));
        return request;
    }

    public UpdatePlaylistRequest ValidateUpdate(UpdatePlaylistRequest request)
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
