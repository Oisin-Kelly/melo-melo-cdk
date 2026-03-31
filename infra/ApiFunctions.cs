using Amazon.CDK.AWS.Lambda;

namespace MeloMeloCdk;

public record ApiFunctions(
    IFunction GetUser,
    IFunction GetTrack,
    IFunction GetTracksSharedWithUser,
    IFunction GetTracksSharedFromUser,
    IFunction IsFollowingUser,
    IFunction FollowUser,
    IFunction GetUserFollowers,
    IFunction GetUserFollowing,
    IFunction UpdateProfile,
    IFunction GetDropboxPresignedUrl
);
