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
    IFunction GetDropboxPresignedUrl,
    IFunction GetUserTracks,
    IFunction UploadTrack,
    IFunction GetUploadStatus,
    IFunction UpdateTrack,
    IFunction ShareTrack,
    IFunction GetTrackSegments,
    IFunction DeleteTrack,
    IFunction CreatePlaylist,
    IFunction GetPlaylists,
    IFunction GetPlaylist,
    IFunction UpdatePlaylist,
    IFunction DeletePlaylist,
    IFunction ModifyPlaylistTracks,
    IFunction LikeTrack,
    IFunction GetTrackLikes,
    IFunction CreateAlbum,
    IFunction GetAlbums,
    IFunction GetAlbum,
    IFunction UpdateAlbum,
    IFunction DeleteAlbum,
    IFunction ModifyAlbumTracks,
    IFunction ShareAlbum,
    IFunction GetAlbumsSharedWithMe
);
