using Amazon.CDK;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.DynamoDB;
using Amazon.CDK.AWS.S3;
using Constructs;

namespace MeloMeloCdk;

public class LambdaStack : BaseStack
{
    public IFunction PostConfirmationFunction { get; }
    public IFunction CheckEmailExistenceFunction { get; }
    public Function UploadTrackFunction { get; }
    public ApiFunctions ApiFunctions { get; }

    private ITable Table { get; }
    private IBucket DropboxBucket { get; }
    private IBucket PublicReadonlyBucket { get; }
    private IBucket PrivateReadonlyBucket { get; }

    public LambdaStack(Construct scope, string id, ITable table, IBucket dropboxBucket, IBucket publicReadonlyBucket,
        IBucket privateReadonlyBucket, IStackProps props = null) : base(scope, id, props)
    {
        Table = table;
        DropboxBucket = dropboxBucket;
        PublicReadonlyBucket = publicReadonlyBucket;
        PrivateReadonlyBucket = privateReadonlyBucket;

        // Cognito triggers
        PostConfirmationFunction = CreateLambdaFunction("Auth/PostConfirmationLambda");
        table.GrantReadWriteData(PostConfirmationFunction);

        CheckEmailExistenceFunction = CreateLambdaFunction("Auth/CheckEmailExistenceLambda");

        // Users
        var getUser = CreateLambdaFunction("User/GetUserLambda");
        table.GrantReadData(getUser);

        var updateProfile = CreateLambdaFunction("User/UpdateUserProfileLambda");
        table.GrantReadWriteData(updateProfile);
        dropboxBucket.GrantReadWrite(updateProfile);
        publicReadonlyBucket.GrantReadWrite(updateProfile);

        // Follows
        var isFollowingUser = CreateLambdaFunction("User/IsFollowingUserLambda");
        table.GrantReadData(isFollowingUser);

        var followUser = CreateLambdaFunction("User/FollowUserLambda");
        table.GrantReadWriteData(followUser);

        var getUserFollowers = CreateLambdaFunction("User/GetUserFollowersLambda");
        table.GrantReadData(getUserFollowers);

        var getUserFollowing = CreateLambdaFunction("User/GetUserFollowingLambda");
        table.GrantReadData(getUserFollowing);

        // Tracks
        var getTrack = CreateLambdaFunction("Track/GetTrackLambda");
        table.GrantReadData(getTrack);

        var getUserTracks = CreateLambdaFunction("Track/GetUserTracksLambda");
        table.GrantReadData(getUserTracks);

        var getTracksSharedWithUser = CreateLambdaFunction("Track/GetTracksSharedWithUserLambda");
        table.GrantReadData(getTracksSharedWithUser);

        var getTracksSharedFromUser = CreateLambdaFunction("Track/GetTracksSharedFromUserLambda");
        table.GrantReadData(getTracksSharedFromUser);

        var updateTrack = CreateLambdaFunction("Track/UpdateTrackLambda");
        table.GrantReadWriteData(updateTrack);
        dropboxBucket.GrantReadWrite(updateTrack);
        publicReadonlyBucket.GrantReadWrite(updateTrack);

        var shareTrack = CreateLambdaFunction("Track/ShareTrackLambda");
        table.GrantReadWriteData(shareTrack);

        var getTrackSegments = CreateLambdaFunction("Track/GetTrackSegmentsLambda");
        table.GrantReadData(getTrackSegments);
        // Presigned GET URLs authorize with the signing role's permissions
        privateReadonlyBucket.GrantRead(getTrackSegments);

        var deleteTrack = CreateLambdaFunction("Track/DeleteTrackLambda");
        table.GrantReadWriteData(deleteTrack);
        privateReadonlyBucket.GrantReadWrite(deleteTrack); // deletes audio segments
        publicReadonlyBucket.GrantReadWrite(deleteTrack); // deletes cover image

        // Track upload pipeline
        UploadTrackFunction = CreateLambdaFunction("Track/UploadTrackLambda");
        table.GrantReadWriteData(UploadTrackFunction); // writes the upload-status record
        dropboxBucket.GrantRead(UploadTrackFunction); // HeadObject for existence/size validation

        var getUploadStatus = CreateLambdaFunction("Track/GetUploadStatusLambda");
        table.GrantReadData(getUploadStatus);

        // Playlists
        var createPlaylist = CreateLambdaFunction("Playlist/CreatePlaylistLambda");
        table.GrantReadWriteData(createPlaylist);
        dropboxBucket.GrantRead(createPlaylist); // staged cover image
        publicReadonlyBucket.GrantReadWrite(createPlaylist); // processed cover

        var getPlaylists = CreateLambdaFunction("Playlist/GetPlaylistsLambda");
        table.GrantReadData(getPlaylists);

        var getPlaylist = CreateLambdaFunction("Playlist/GetPlaylistLambda");
        table.GrantReadData(getPlaylist);

        var updatePlaylist = CreateLambdaFunction("Playlist/UpdatePlaylistLambda");
        table.GrantReadWriteData(updatePlaylist);
        dropboxBucket.GrantRead(updatePlaylist); // staged cover image
        publicReadonlyBucket.GrantReadWrite(updatePlaylist); // processed cover

        var deletePlaylist = CreateLambdaFunction("Playlist/DeletePlaylistLambda");
        table.GrantReadWriteData(deletePlaylist);
        publicReadonlyBucket.GrantReadWrite(deletePlaylist); // deletes cover image

        var modifyPlaylistTracks = CreateLambdaFunction("Playlist/ModifyPlaylistTracksLambda");
        table.GrantReadWriteData(modifyPlaylistTracks);

        // Likes
        var likeTrack = CreateLambdaFunction("Track/LikeTrackLambda");
        table.GrantReadWriteData(likeTrack);

        var getTrackLikes = CreateLambdaFunction("Track/GetTrackLikesLambda");
        table.GrantReadData(getTrackLikes);

        // Albums
        var createAlbum = CreateLambdaFunction("Album/CreateAlbumLambda");
        table.GrantReadWriteData(createAlbum);
        dropboxBucket.GrantRead(createAlbum); // staged cover image
        publicReadonlyBucket.GrantReadWrite(createAlbum); // processed cover

        var getAlbums = CreateLambdaFunction("Album/GetAlbumsLambda");
        table.GrantReadData(getAlbums);

        var getAlbum = CreateLambdaFunction("Album/GetAlbumLambda");
        table.GrantReadData(getAlbum);

        var updateAlbum = CreateLambdaFunction("Album/UpdateAlbumLambda");
        table.GrantReadWriteData(updateAlbum);
        dropboxBucket.GrantRead(updateAlbum); // staged cover image
        publicReadonlyBucket.GrantReadWrite(updateAlbum); // processed cover

        var deleteAlbum = CreateLambdaFunction("Album/DeleteAlbumLambda");
        table.GrantReadWriteData(deleteAlbum);
        publicReadonlyBucket.GrantReadWrite(deleteAlbum); // deletes cover image

        var modifyAlbumTracks = CreateLambdaFunction("Album/ModifyAlbumTracksLambda");
        table.GrantReadWriteData(modifyAlbumTracks);

        var shareAlbum = CreateLambdaFunction("Album/ShareAlbumLambda");
        table.GrantReadWriteData(shareAlbum);

        var getAlbumsSharedWithMe = CreateLambdaFunction("Album/GetAlbumsSharedWithMeLambda");
        table.GrantReadData(getAlbumsSharedWithMe);

        // S3
        var getDropboxPresignedUrl = CreateLambdaFunction("Track/GetDropboxPresignedUrlLambda");
        dropboxBucket.GrantWrite(getDropboxPresignedUrl);

        ApiFunctions = new ApiFunctions(
            GetUser: getUser,
            GetTrack: getTrack,
            GetTracksSharedWithUser: getTracksSharedWithUser,
            GetTracksSharedFromUser: getTracksSharedFromUser,
            IsFollowingUser: isFollowingUser,
            FollowUser: followUser,
            GetUserFollowers: getUserFollowers,
            GetUserFollowing: getUserFollowing,
            UpdateProfile: updateProfile,
            GetDropboxPresignedUrl: getDropboxPresignedUrl,
            GetUserTracks: getUserTracks,
            UploadTrack: UploadTrackFunction,
            GetUploadStatus: getUploadStatus,
            UpdateTrack: updateTrack,
            ShareTrack: shareTrack,
            GetTrackSegments: getTrackSegments,
            DeleteTrack: deleteTrack,
            CreatePlaylist: createPlaylist,
            GetPlaylists: getPlaylists,
            GetPlaylist: getPlaylist,
            UpdatePlaylist: updatePlaylist,
            DeletePlaylist: deletePlaylist,
            ModifyPlaylistTracks: modifyPlaylistTracks,
            LikeTrack: likeTrack,
            GetTrackLikes: getTrackLikes,
            CreateAlbum: createAlbum,
            GetAlbums: getAlbums,
            GetAlbum: getAlbum,
            UpdateAlbum: updateAlbum,
            DeleteAlbum: deleteAlbum,
            ModifyAlbumTracks: modifyAlbumTracks,
            ShareAlbum: shareAlbum,
            GetAlbumsSharedWithMe: getAlbumsSharedWithMe
        );
    }

    private Function CreateLambdaFunction(string lambdaName, int memorySize = 512)
    {
        return CreateAotFunction(lambdaName, Table, DropboxBucket, PublicReadonlyBucket, PrivateReadonlyBucket,
            memorySize);
    }
}