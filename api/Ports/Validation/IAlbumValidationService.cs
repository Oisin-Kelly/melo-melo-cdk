using Domain;

namespace Ports.Validation;

public interface IAlbumValidationService
{
    CreateAlbumRequest ValidateCreate(CreateAlbumRequest request);
    UpdateAlbumRequest ValidateUpdate(UpdateAlbumRequest request);
    ShareAlbumRequest ValidateShare(ShareAlbumRequest request);
    Task<SetAlbumTracksRequest> ValidateSetTracksAsync(string ownerUsername, SetAlbumTracksRequest request);
}
