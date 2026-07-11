using Domain;

namespace Ports;

public interface IAlbumValidationService
{
    /// Sanitises and validates in place (name required, trackIds lowercased +
    /// deduped). Throws ArgumentException with a user-safe message.
    CreateAlbumRequest ValidateCreate(CreateAlbumRequest request);

    UpdateAlbumRequest ValidateUpdate(UpdateAlbumRequest request);
}
