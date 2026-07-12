using Domain;

namespace Ports.Validation;

public interface ITrackValidationService
{
    Task<ProcessTrackInput> ValidateAsync(ProcessTrackInput input);

    /// Sanitises and validates in place. Throws ArgumentException with a user-safe message.
    UpdateTrackRequest ValidateUpdate(UpdateTrackRequest request);

    /// Sanitises and validates in place. Throws ArgumentException with a user-safe message.
    ShareTrackRequest ValidateShare(ShareTrackRequest request);

    /// Checks the uploaded audio file exists in the dropbox bucket and is within the
    /// size limit. Throws ArgumentException (user-safe message) otherwise.
    Task ValidateUploadedAudioAsync(string audioKey);
}
