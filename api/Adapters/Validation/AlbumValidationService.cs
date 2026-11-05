using Domain;
using FluentValidation;
using Ports.Repositories;
using Ports.Validation;

namespace Adapters.Validation;

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

internal class ShareAlbumValidator : AbstractValidator<ShareAlbumRequest>
{
    public ShareAlbumValidator()
    {
        RuleFor(x => x)
            .Must(x => x.Add.Count > 0 || x.Remove.Count > 0)
            .WithMessage("provide at least one user in add or remove");
        RuleFor(x => x.Add)
            .Must(x => x.Count <= AlbumValidationService.MaxRecipientsPerShare)
            .WithMessage($"you can share with at most {AlbumValidationService.MaxRecipientsPerShare} people at a time");
        RuleFor(x => x.Remove)
            .Must(x => x.Count <= AlbumValidationService.MaxRecipientsPerShare)
            .WithMessage($"you can remove at most {AlbumValidationService.MaxRecipientsPerShare} people at a time");
        RuleFor(x => x.Caption)
            .MaximumLength(300).WithMessage("caption must be at most 300 characters");
    }
}

public sealed class AlbumValidationService : IAlbumValidationService
{
    public const int MaxTracksPerAlbum = 50;

    // Per request, not per album: an album has no total recipient cap (see the fan-out ceiling
    // in docs/data-model/README.md).
    public const int MaxRecipientsPerShare = 50;

    private static readonly CreateAlbumValidator CreateValidator = new();
    private static readonly UpdateAlbumValidator UpdateValidator = new();
    private static readonly ShareAlbumValidator ShareValidator = new();

    private readonly ITrackRepository _trackRepository;

    public AlbumValidationService(ITrackRepository trackRepository)
    {
        _trackRepository = trackRepository;
    }

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
        request.Slug = InputSanitiser.ValidSlug(request.Slug, SlugKind.Album);

        ThrowIfInvalid(UpdateValidator.Validate(request));
        return request;
    }

    public ShareAlbumRequest ValidateShare(ShareAlbumRequest request)
    {
        request.Caption = InputSanitiser.MultiLine(request.Caption);

        ThrowIfInvalid(ShareValidator.Validate(request));
        return request;
    }

    public async Task<SetAlbumTracksRequest> ValidateSetTracksAsync(string ownerUsername,
        SetAlbumTracksRequest request)
    {
        request.TrackIds = request.TrackIds.Select(id => id.ToLowerInvariant()).Distinct().ToList();

        if (request.TrackIds.Count > MaxTracksPerAlbum)
            throw new ArgumentException($"albums can hold at most {MaxTracksPerAlbum} tracks");

        // Albums may only contain the owner's own tracks
        var ownedIds = await _trackRepository.GetOwnedTrackIdsAsync(ownerUsername, request.TrackIds);
        var notOwned = request.TrackIds.Except(ownedIds, StringComparer.OrdinalIgnoreCase).ToList();
        if (notOwned.Count > 0)
            throw new ArgumentException(
                $"albums may only contain your own tracks; not yours or not found: {string.Join(", ", notOwned)}");

        return request;
    }

    private static void ThrowIfInvalid(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid)
            return;

        throw new ArgumentException(string.Join(" ", result.Errors.Select(x => x.ErrorMessage).Distinct()));
    }
}
