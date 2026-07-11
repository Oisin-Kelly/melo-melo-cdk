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
        PostConfirmationFunction = CreateLambdaFunction("PostConfirmationLambda");
        table.GrantReadWriteData(PostConfirmationFunction);

        CheckEmailExistenceFunction = CreateLambdaFunction("CheckEmailExistenceLambda");

        // Users
        var getUser = CreateLambdaFunction("GetUserLambda");
        table.GrantReadData(getUser);

        var updateProfile = CreateLambdaFunction("UpdateUserProfileLambda");
        table.GrantReadWriteData(updateProfile);
        dropboxBucket.GrantReadWrite(updateProfile);
        publicReadonlyBucket.GrantReadWrite(updateProfile);

        // Follows
        var isFollowingUser = CreateLambdaFunction("IsFollowingUserLambda");
        table.GrantReadData(isFollowingUser);

        var followUser = CreateLambdaFunction("FollowUserLambda");
        table.GrantReadWriteData(followUser);

        var getUserFollowers = CreateLambdaFunction("GetUserFollowersLambda");
        table.GrantReadData(getUserFollowers);

        var getUserFollowing = CreateLambdaFunction("GetUserFollowingLambda");
        table.GrantReadData(getUserFollowing);

        // Tracks
        var getTrack = CreateLambdaFunction("GetTrackLambda");
        table.GrantReadData(getTrack);

        var getUserTracks = CreateLambdaFunction("GetUserTracksLambda");
        table.GrantReadData(getUserTracks);

        var getTracksSharedWithUser = CreateLambdaFunction("GetTracksSharedWithUserLambda");
        table.GrantReadData(getTracksSharedWithUser);

        var getTracksSharedFromUser = CreateLambdaFunction("GetTracksSharedFromUserLambda");
        table.GrantReadData(getTracksSharedFromUser);

        var updateTrack = CreateLambdaFunction("UpdateTrackLambda");
        table.GrantReadWriteData(updateTrack);
        dropboxBucket.GrantReadWrite(updateTrack);
        publicReadonlyBucket.GrantReadWrite(updateTrack);

        var shareTrack = CreateLambdaFunction("ShareTrackLambda");
        table.GrantReadWriteData(shareTrack);

        var getTrackSegments = CreateLambdaFunction("GetTrackSegmentsLambda");
        table.GrantReadData(getTrackSegments);
        // Presigned GET URLs authorize with the signing role's permissions
        privateReadonlyBucket.GrantRead(getTrackSegments);

        var deleteTrack = CreateLambdaFunction("DeleteTrackLambda");
        table.GrantReadWriteData(deleteTrack);
        privateReadonlyBucket.GrantReadWrite(deleteTrack); // deletes audio segments
        publicReadonlyBucket.GrantReadWrite(deleteTrack); // deletes cover image

        // Track upload pipeline
        UploadTrackFunction = CreateLambdaFunction("UploadTrackLambda");
        table.GrantReadWriteData(UploadTrackFunction); // writes the upload-status record
        dropboxBucket.GrantRead(UploadTrackFunction); // HeadObject for existence/size validation

        var getUploadStatus = CreateLambdaFunction("GetUploadStatusLambda");
        table.GrantReadData(getUploadStatus);

        // Playlists
        var createPlaylist = CreateLambdaFunction("CreatePlaylistLambda");
        table.GrantReadWriteData(createPlaylist);

        var getPlaylists = CreateLambdaFunction("GetPlaylistsLambda");
        table.GrantReadData(getPlaylists);

        var getPlaylist = CreateLambdaFunction("GetPlaylistLambda");
        table.GrantReadData(getPlaylist);

        var updatePlaylist = CreateLambdaFunction("UpdatePlaylistLambda");
        table.GrantReadWriteData(updatePlaylist);

        var deletePlaylist = CreateLambdaFunction("DeletePlaylistLambda");
        table.GrantReadWriteData(deletePlaylist);

        var modifyPlaylistTracks = CreateLambdaFunction("ModifyPlaylistTracksLambda");
        table.GrantReadWriteData(modifyPlaylistTracks);

        // Likes
        var likeTrack = CreateLambdaFunction("LikeTrackLambda");
        table.GrantReadWriteData(likeTrack);

        var getTrackLikes = CreateLambdaFunction("GetTrackLikesLambda");
        table.GrantReadData(getTrackLikes);

        // Albums
        var createAlbum = CreateLambdaFunction("CreateAlbumLambda");
        table.GrantReadWriteData(createAlbum);

        var getAlbums = CreateLambdaFunction("GetAlbumsLambda");
        table.GrantReadData(getAlbums);

        var getAlbum = CreateLambdaFunction("GetAlbumLambda");
        table.GrantReadData(getAlbum);

        var updateAlbum = CreateLambdaFunction("UpdateAlbumLambda");
        table.GrantReadWriteData(updateAlbum);

        var deleteAlbum = CreateLambdaFunction("DeleteAlbumLambda");
        table.GrantReadWriteData(deleteAlbum);

        var modifyAlbumTracks = CreateLambdaFunction("ModifyAlbumTracksLambda");
        table.GrantReadWriteData(modifyAlbumTracks);

        var shareAlbum = CreateLambdaFunction("ShareAlbumLambda");
        table.GrantReadWriteData(shareAlbum);

        var getAlbumsSharedWithMe = CreateLambdaFunction("GetAlbumsSharedWithMeLambda");
        table.GrantReadData(getAlbumsSharedWithMe);

        // S3
        var getDropboxPresignedUrl = CreateLambdaFunction("GetDropboxPresignedUrlLambda");
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