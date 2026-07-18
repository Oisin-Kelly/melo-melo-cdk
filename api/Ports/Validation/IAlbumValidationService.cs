using Domain;

namespace Ports.Validation;

public interface IAlbumValidationService
{
    /// Sanitises and validates in place (name required, trackIds lowercased +
    /// deduped). Throws ArgumentException with a user-safe message.
    CreateAlbumRequest ValidateCreate(CreateAlbumRequest request);

    UpdateAlbumRequest ValidateUpdate(UpdateAlbumRequest request);

    /// Sanitises in place (ids lowercased + deduped, first occurrence wins) and
    /// enforces the tracklist rules: every id must be one of the owner's own
    /// tracks and the list stays within the track cap. An empty list is valid
    /// (clears the album). Throws ArgumentException with a user-safe message.
    Task<SetAlbumTracksRequest> ValidateSetTracksAsync(string ownerUsername, SetAlbumTracksRequest request);
}
