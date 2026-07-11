using Domain;

namespace Ports;

public interface IPlaylistValidationService
{
    /// Sanitises and validates in place (name required on create). Throws
    /// ArgumentException with a user-safe message.
    CreatePlaylistRequest ValidateCreate(CreatePlaylistRequest request);

    UpdatePlaylistRequest ValidateUpdate(UpdatePlaylistRequest request);
}
