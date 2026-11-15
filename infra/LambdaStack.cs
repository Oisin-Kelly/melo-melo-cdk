using System.Collections.Generic;
using Amazon.CDK;
using Amazon.CDK.AWS.CloudWatch;
using Amazon.CDK.AWS.Lambda;
using Amazon.CDK.AWS.Lambda.EventSources;
using Amazon.CDK.AWS.SQS;
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

        var searchUsers = CreateLambdaFunction("User/SearchUsersLambda");
        table.GrantReadData(searchUsers);

        var resolveSlug = CreateLambdaFunction("User/ResolveSlugLambda");
        table.GrantReadData(resolveSlug);

        var getUserFollowers = CreateLambdaFunction("User/GetUserFollowersLambda");
        table.GrantReadData(getUserFollowers);

        var getUserFollowing = CreateLambdaFunction("User/GetUserFollowingLambda");
        table.GrantReadData(getUserFollowing);

        // Tracks
        var getTrack = CreateLambdaFunction("Track/GetTrackLambda");
        table.GrantReadData(getTrack);

        var getUserTracks = CreateLambdaFunction("Track/GetUserTracksLambda");
        table.GrantReadData(getUserTracks);

        var getLibraryTracks = CreateLambdaFunction("Track/GetLibraryTracksLambda");
        table.GrantReadData(getLibraryTracks);

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

        var getTrackRecipients = CreateLambdaFunction("Track/GetTrackRecipientsLambda");
        table.GrantReadData(getTrackRecipients);

        var getTrackSegments = CreateLambdaFunction("Track/GetTrackSegmentsLambda");
        table.GrantReadData(getTrackSegments);
        // Presigned GET URLs authorize with the signing role's permissions
        privateReadonlyBucket.GrantRead(getTrackSegments);

        var getOriginalTrack = CreateLambdaFunction("Track/GetOriginalTrackLambda");
        table.GrantReadData(getOriginalTrack);
        // HEAD of the archived original + its presigned download URL (signed with this role)
        privateReadonlyBucket.GrantRead(getOriginalTrack);

        var deleteTrack = CreateLambdaFunction("Track/DeleteTrackLambda");
        table.GrantReadWriteData(deleteTrack);
        privateReadonlyBucket.GrantReadWrite(deleteTrack); // deletes the processed audio file
        publicReadonlyBucket.GrantReadWrite(deleteTrack); // deletes cover image

        var removeSharedTrack = CreateLambdaFunction("Track/RemoveSharedTrackLambda");
        table.GrantReadWriteData(removeSharedTrack); // recipient removes a shared track from their library

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

        var addPlaylistTrack = CreateLambdaFunction("Playlist/AddPlaylistTrackLambda");
        table.GrantReadWriteData(addPlaylistTrack);

        var removePlaylistTrack = CreateLambdaFunction("Playlist/RemovePlaylistTrackLambda");
        table.GrantReadWriteData(removePlaylistTrack);

        var setPlaylistTracks = CreateLambdaFunction("Playlist/SetPlaylistTracksLambda");
        table.GrantReadWriteData(setPlaylistTracks);

        // Likes
        var likeTrack = CreateLambdaFunction("Track/LikeTrackLambda");
        table.GrantReadWriteData(likeTrack);

        var getTrackLikes = CreateLambdaFunction("Track/GetTrackLikesLambda");
        table.GrantReadData(getTrackLikes);

        var getTrackAppearsIn = CreateLambdaFunction("Track/GetTrackAppearsInLambda");
        table.GrantReadData(getTrackAppearsIn);

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

        var setAlbumTracks = CreateLambdaFunction("Album/SetAlbumTracksLambda");
        table.GrantReadWriteData(setAlbumTracks);

        var shareAlbum = CreateLambdaFunction("Album/ShareAlbumLambda");
        table.GrantReadWriteData(shareAlbum);

        var removeSharedAlbum = CreateLambdaFunction("Album/RemoveSharedAlbumLambda");
        table.GrantReadWriteData(removeSharedAlbum); // recipient removes a shared album from their library

        var getAlbumRecipients = CreateLambdaFunction("Album/GetAlbumRecipientsLambda");
        table.GrantReadData(getAlbumRecipients);

        var likeAlbum = CreateLambdaFunction("Album/LikeAlbumLambda");
        table.GrantReadWriteData(likeAlbum);

        var getAlbumLikes = CreateLambdaFunction("Album/GetAlbumLikesLambda");
        table.GrantReadData(getAlbumLikes);

        var getLikedAlbums = CreateLambdaFunction("Album/GetLikedAlbumsLambda");
        table.GrantReadData(getLikedAlbums);

        var getAlbumsSharedWithMe = CreateLambdaFunction("Album/GetAlbumsSharedWithMeLambda");
        table.GrantReadData(getAlbumsSharedWithMe);

        var getAlbumsSharedFromUser = CreateLambdaFunction("Album/GetAlbumsSharedFromUserLambda");
        table.GrantReadData(getAlbumsSharedFromUser);

        // Feed
        var getFeed = CreateLambdaFunction("Feed/GetFeedLambda");
        table.GrantReadData(getFeed);

        // Resume progress + last-visit marker
        var updateProgress = CreateLambdaFunction("User/UpdateProgressLambda");
        table.GrantReadWriteData(updateProgress);

        var getProgress = CreateLambdaFunction("User/GetProgressLambda");
        table.GrantReadData(getProgress);

        var markSeen = CreateLambdaFunction("User/MarkSeenLambda");
        table.GrantReadWriteData(markSeen);

        // Activity feed
        var getActivity = CreateLambdaFunction("Activity/GetActivityLambda");
        table.GrantReadData(getActivity);

        var markActivitySeen = CreateLambdaFunction("Activity/MarkActivitySeenLambda");
        table.GrantReadWriteData(markActivitySeen);

        // Share links
        var createLink = CreateLambdaFunction("Link/CreateLinkLambda");
        table.GrantReadWriteData(createLink);

        var getLinks = CreateLambdaFunction("Link/GetLinksLambda");
        table.GrantReadData(getLinks);

        var revokeLink = CreateLambdaFunction("Link/RevokeLinkLambda");
        table.GrantReadWriteData(revokeLink);

        var restoreLink = CreateLambdaFunction("Link/RestoreLinkLambda");
        table.GrantReadWriteData(restoreLink);

        var getLinkPreview = CreateLambdaFunction("Link/GetLinkPreviewLambda");
        table.GrantReadData(getLinkPreview);
        // Presigned preview-clip / short-track URLs authorize with this role
        privateReadonlyBucket.GrantRead(getLinkPreview);

        var getLinkViewer = CreateLambdaFunction("Link/GetLinkViewerLambda");
        table.GrantReadData(getLinkViewer);

        var acceptLink = CreateLambdaFunction("Link/AcceptLinkLambda");
        table.GrantReadWriteData(acceptLink); // claims the link + writes the share (grants, feed)

        // S3
        var getDropboxPresignedUrl = CreateLambdaFunction("Track/GetDropboxPresignedUrlLambda");
        dropboxBucket.GrantWrite(getDropboxPresignedUrl);

        AddTableEvents(table);

        ApiFunctions = new ApiFunctions(
            GetUser: getUser,
            SearchUsers: searchUsers,
            ResolveSlug: resolveSlug,
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
            GetLibraryTracks: getLibraryTracks,
            UploadTrack: UploadTrackFunction,
            GetUploadStatus: getUploadStatus,
            UpdateTrack: updateTrack,
            ShareTrack: shareTrack,
            GetTrackRecipients: getTrackRecipients,
            GetTrackSegments: getTrackSegments,
            GetOriginalTrack: getOriginalTrack,
            DeleteTrack: deleteTrack,
            RemoveSharedTrack: removeSharedTrack,
            CreatePlaylist: createPlaylist,
            GetPlaylists: getPlaylists,
            GetPlaylist: getPlaylist,
            UpdatePlaylist: updatePlaylist,
            DeletePlaylist: deletePlaylist,
            AddPlaylistTrack: addPlaylistTrack,
            RemovePlaylistTrack: removePlaylistTrack,
            SetPlaylistTracks: setPlaylistTracks,
            LikeTrack: likeTrack,
            GetTrackLikes: getTrackLikes,
            GetTrackAppearsIn: getTrackAppearsIn,
            CreateAlbum: createAlbum,
            GetAlbums: getAlbums,
            GetAlbum: getAlbum,
            UpdateAlbum: updateAlbum,
            DeleteAlbum: deleteAlbum,
            SetAlbumTracks: setAlbumTracks,
            ShareAlbum: shareAlbum,
            RemoveSharedAlbum: removeSharedAlbum,
            GetAlbumRecipients: getAlbumRecipients,
            LikeAlbum: likeAlbum,
            GetAlbumLikes: getAlbumLikes,
            GetLikedAlbums: getLikedAlbums,
            GetAlbumsSharedWithMe: getAlbumsSharedWithMe,
            GetAlbumsSharedFromUser: getAlbumsSharedFromUser,
            GetFeed: getFeed,
            UpdateProgress: updateProgress,
            GetProgress: getProgress,
            MarkSeen: markSeen,
            GetActivity: getActivity,
            MarkActivitySeen: markActivitySeen,
            CreateLink: createLink,
            GetLinks: getLinks,
            RevokeLink: revokeLink,
            RestoreLink: restoreLink,
            GetLinkPreview: getLinkPreview,
            GetLinkViewer: getLinkViewer,
            AcceptLink: acceptLink
        );
    }

    // Table events: the activity feed follows from likes, shares and follows being added or
    // removed (Adapters/Events/ActivityEvents), read off the table's stream in order per item.
    // Only those records reach the Lambda (filters, any one matches); one batch per shard at
    // a time keeps the order; a failing record is retried, then parked in the dead-letter
    // queue so it can't hold its shard up for the stream's 24 hours.
    private void AddTableEvents(ITable table)
    {
        var tableEvents = CreateLambdaFunction("Events/TableEventsLambda");
        table.GrantReadWriteData(tableEvents);

        var deadLetters = new Queue(this, "TableEventsDlq", new QueueProps
        {
            QueueName = $"table-events-dlq-{Env}",
            RetentionPeriod = Duration.Days(14),
        });
        new Alarm(this, "TableEventsDlqAlarm", new AlarmProps
        {
            AlarmName = $"table-events-dlq-{Env}",
            AlarmDescription = "A table change couldn't be processed (activity) — see the dead-letter queue",
            Metric = deadLetters.MetricApproximateNumberOfMessagesVisible(),
            Threshold = 1,
            EvaluationPeriods = 1,
            ComparisonOperator = ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            TreatMissingData = TreatMissingData.NOT_BREACHING,
        });

        // Event-filter patterns, written out ({"S": [{"prefix": …}]}) with concrete Dictionary
        // values all the way down: jsii can't pass IDictionary-typed values (FilterRule's
        // included) back into CDK
        static IDictionary<string, object> KeysMatch(Dictionary<string, object> keys) =>
            FilterCriteria.Filter(new Dictionary<string, object>
            {
                ["dynamodb"] = new Dictionary<string, object> { ["Keys"] = keys },
            });
        static Dictionary<string, object> Prefix(string prefix) =>
            new() { ["S"] = new object[] { new Dictionary<string, object> { ["prefix"] = prefix } } };

        tableEvents.AddEventSource(new DynamoEventSource(table, new DynamoEventSourceProps
        {
            StartingPosition = StartingPosition.LATEST,
            BatchSize = 100,
            ParallelizationFactor = 1,
            BisectBatchOnError = true,
            ReportBatchItemFailures = true,
            RetryAttempts = 5,
            MaxRecordAge = Duration.Hours(1),
            OnFailure = new SqsDlq(deadLetters),
            Filters =
            [
                // Track and album likes: {TRACK|ALBUM}#{id} / LIKE#{user}
                KeysMatch(new Dictionary<string, object> { ["SK"] = Prefix("LIKE#") }),
                // Track and album shares (and album grants, which the handler skips)
                KeysMatch(new Dictionary<string, object> { ["SK"] = Prefix("SHARED#") }),
                // Follows: FOLLOW#{target} / USER#{follower} — both in one pattern
                KeysMatch(new Dictionary<string, object> { ["PK"] = Prefix("FOLLOW#"), ["SK"] = Prefix("USER#") }),
            ],
        }));
    }

    private Function CreateLambdaFunction(string lambdaName, int memorySize = 512)
    {
        return CreateAotFunction(lambdaName, Table, DropboxBucket, PublicReadonlyBucket, PrivateReadonlyBucket,
            memorySize);
    }
}