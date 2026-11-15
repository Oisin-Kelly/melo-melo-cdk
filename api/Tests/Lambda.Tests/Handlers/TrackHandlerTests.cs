using System.Net;
using Amazon.StepFunctions;
using Amazon.StepFunctions.Model;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;
using Ports.Services;
using Ports.Validation;

namespace Lambda.Tests.Handlers;

// Track handlers with every dependency mocked: they own auth (401), ownership/access (404 — never
// 403, so existence isn't leaked), validation (400) and error mapping (500); the repositories they
// call are covered against DynamoDB Local in Adapters.Tests.
public class TrackHandlerTests
{
    private const string Owner = "alice";
    private const string Stranger = "mallory";
    private const string TrackId = "t1";

    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private readonly ISharedTrackRepository _shares = Substitute.For<ISharedTrackRepository>();
    private readonly ILikeRepository _likes = Substitute.For<ILikeRepository>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IUploadStatusRepository _uploads = Substitute.For<IUploadStatusRepository>();
    private readonly IAlbumTracklistRepository _albumTracklist = Substitute.For<IAlbumTracklistRepository>();
    private readonly IAudioService _audio = Substitute.For<IAudioService>();
    private readonly IImageService _images = Substitute.For<IImageService>();
    private readonly IS3Service _dropbox = Substitute.For<IS3Service>();
    private readonly ITrackValidationService _validation = Substitute.For<ITrackValidationService>();
    private readonly TestLambdaContext _context = new();

    public TrackHandlerTests()
    {
        _tracks.GetTrackAsync(TrackId).Returns(Fakes.Track(TrackId, Owner));
        // Validation passes requests through unchanged unless a test says otherwise
        _validation.ValidateUpdate(Arg.Any<UpdateTrackRequest>()).Returns(c => c.Arg<UpdateTrackRequest>());
        _validation.ValidateShare(Arg.Any<ShareTrackRequest>()).Returns(c => c.Arg<ShareTrackRequest>());
        _validation.ValidateAsync(Arg.Any<ProcessTrackInput>()).Returns(c => c.Arg<ProcessTrackInput>());
    }

    // ---------------------------------------------------------------- GET /tracks/{trackId}

    private GetTrackLambda.Function GetTrack => new(_tracks, _shares, _likes);

    [Fact]
    public async Task GetTrack_WithoutIdentity_Is401_AndTouchesNothing()
    {
        (await GetTrack.FunctionHandler(Http.Anonymous(), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await _tracks.DidNotReceiveWithAnyArgs().GetTrackAsync(default!);
    }

    [Fact]
    public async Task GetTrack_BlankId_Is400()
    {
        (await GetTrack.FunctionHandler(Http.As(Owner), _context, " ")).ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GetTrack_Unknown_Is404()
    {
        (await GetTrack.FunctionHandler(Http.As(Owner), _context, "nope")).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetTrack_WithoutAccess_Is404_NotForbidden()
    {
        (await GetTrack.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetTrack_Owner_SeesCounts()
    {
        _likes.IsTrackLikedByUserAsync(TrackId, Owner).Returns(true);

        var body = (await GetTrack.FunctionHandler(Http.As(Owner), _context, TrackId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("likeCount").GetInt32().Should().Be(3);
        body.GetProperty("shareCount").GetInt32().Should().Be(2);
        body.GetProperty("likedByMe").GetBoolean().Should().BeTrue();
        await _shares.DidNotReceiveWithAnyArgs().IsTrackAccessibleToUser(default!, default!); // owner short-circuits
    }

    [Fact]
    public async Task GetTrack_Recipient_GetsTheTrackWithOwnerOnlyCountsStripped()
    {
        _shares.IsTrackAccessibleToUser(TrackId, "bob").Returns(true);

        var body = (await GetTrack.FunctionHandler(Http.As("bob"), _context, TrackId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.TryGetProperty("likeCount", out _).Should().BeFalse();
        body.TryGetProperty("shareCount", out _).Should().BeFalse();
        body.GetProperty("likedByMe").GetBoolean().Should().BeFalse();
        body.TryGetProperty("myShare", out _).Should().BeFalse(); // reached via an album: no direct share
    }

    [Fact]
    public async Task GetTrack_DirectRecipient_SeesTheirShareWithItsCaption()
    {
        _shares.IsTrackAccessibleToUser(TrackId, "bob").Returns(true);
        _shares.GetDirectShareAsync(TrackId, "bob").Returns(new ShareNote { SharedAt = 7, Caption = "this one!" });

        var share = (await GetTrack.FunctionHandler(Http.As("bob"), _context, TrackId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("myShare");

        share.GetProperty("sharedAt").GetInt64().Should().Be(7);
        share.GetProperty("caption").GetString().Should().Be("this one!");
    }

    [Fact]
    public async Task GetTrack_RepositoryFailure_Is500_LoggedButNeverLeakedToTheClient()
    {
        _tracks.GetTrackAsync(TrackId).ThrowsAsync(
            new InvalidOperationException("Requested resource not found: Table: melo-melo-table-dev"));

        var response = await GetTrack.FunctionHandler(Http.As(Owner), _context, TrackId);

        response.ShouldHaveStatus(HttpStatusCode.InternalServerError).ErrorMessage()
            .Should().Be("Something went wrong. Please try again.");
        response.Body.Should().NotContain("melo-melo-table");
        _context.TestLogger.Lines.Should().Contain(l => l.Contains("melo-melo-table-dev")); // still logged for us
    }

    // ---------------------------------------------------------------- POST /tracks/{trackId}/like

    private LikeTrackLambda.Function LikeTrack => new(_tracks, _shares, _likes);

    [Fact]
    public async Task Like_MissingNewValue_Is400()
    {
        (await LikeTrack.FunctionHandler(Http.As(Owner), _context, TrackId, new LikeTrackLambda.LikeTrackRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Like_WithAccess_LikesWithTheOwnerAndDuration()
    {
        _shares.IsTrackAccessibleToUser(TrackId, "bob").Returns(true);

        var body = (await LikeTrack.FunctionHandler(Http.As("bob"), _context, TrackId,
                new LikeTrackLambda.LikeTrackRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("newValue").GetBoolean().Should().BeTrue();
        await _likes.Received(1).LikeTrackAsync(TrackId, "bob", Owner, 180);
    }

    [Fact]
    public async Task Like_WithoutAccess_Is404_AndNothingIsLiked()
    {
        (await LikeTrack.FunctionHandler(Http.As(Stranger), _context, TrackId,
                new LikeTrackLambda.LikeTrackRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _likes.DidNotReceiveWithAnyArgs().LikeTrackAsync(default!, default!, default!, default);
    }

    [Fact]
    public async Task Unlike_IsAllowedEvenAfterAccessIsGone()
    {
        // Deliberate: you can always take back a like, even on a track since unshared from you
        (await LikeTrack.FunctionHandler(Http.As(Stranger), _context, TrackId,
                new LikeTrackLambda.LikeTrackRequest { NewValue = false }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _likes.Received(1).UnlikeTrackAsync(TrackId, Stranger, Owner);
        await _shares.DidNotReceiveWithAnyArgs().IsTrackAccessibleToUser(default!, default!);
    }

    [Fact]
    public async Task Like_UnknownTrack_Is404()
    {
        (await LikeTrack.FunctionHandler(Http.As(Owner), _context, "nope",
                new LikeTrackLambda.LikeTrackRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    // ---------------------------------------------------------------- PUT /tracks/{trackId}

    private UpdateTrackLambda.Function UpdateTrack => new(_tracks, _images, _validation);

    [Fact]
    public async Task Update_NonOwner_Is404_BeforeValidating()
    {
        (await UpdateTrack.FunctionHandler(Http.As(Stranger), _context, TrackId, new UpdateTrackRequest { Name = "x" }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        _validation.DidNotReceiveWithAnyArgs().ValidateUpdate(default!);
        await _tracks.DidNotReceiveWithAnyArgs().UpdateTrackAsync(default!, default!, default!, default, default, default, default);
    }

    [Fact]
    public async Task Update_InvalidRequest_Is400()
    {
        _validation.ValidateUpdate(Arg.Any<UpdateTrackRequest>()).Throws(new ArgumentException("name is required"));

        var response = await UpdateTrack.FunctionHandler(Http.As(Owner), _context, TrackId, new UpdateTrackRequest());

        response.ShouldHaveStatus(HttpStatusCode.BadRequest).ErrorMessage().Should().Be("name is required");
    }

    [Fact]
    public async Task Update_WithANewCover_ProcessesItToTheTracksCoverKey()
    {
        var image = new ImageProcessingResult("#112233", "https://cdn/cover.jpg");
        _images.ProcessImageAsync(Owner, "alice/cover.png", $"tracks/{TrackId}/cover_400x400.jpg", 400, 400).Returns(image);
        _tracks.UpdateTrackAsync(Owner, TrackId, "New", null, null, image, false).Returns(Fakes.Track(TrackId, Owner));

        (await UpdateTrack.FunctionHandler(Http.As(Owner), _context, TrackId,
                new UpdateTrackRequest { Name = "New", ImageKey = "alice/cover.png" }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _tracks.Received(1).UpdateTrackAsync(Owner, TrackId, "New", null, null, image, false);
    }

    [Fact]
    public async Task Update_ClearedImage_IsPassedThrough_WithoutProcessingAnything()
    {
        _tracks.UpdateTrackAsync(Owner, TrackId, "New", null, null, null, true).Returns(Fakes.Track(TrackId, Owner));

        (await UpdateTrack.FunctionHandler(Http.As(Owner), _context, TrackId,
                new UpdateTrackRequest { Name = "New", ClearedImage = true }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _images.DidNotReceiveWithAnyArgs().ProcessImageAsync(default!, default!, default!, default, default);
    }

    [Fact]
    public async Task Update_ThatFindsNothingToReturn_Is500()
    {
        _tracks.UpdateTrackAsync(Owner, TrackId, "New", null, null, null, false).Returns((Track?)null);

        (await UpdateTrack.FunctionHandler(Http.As(Owner), _context, TrackId, new UpdateTrackRequest { Name = "New" }))
            .ShouldHaveStatus(HttpStatusCode.InternalServerError);
    }

    // ---------------------------------------------------------------- DELETE /tracks/{trackId}

    private DeleteTrackLambda.Function DeleteTrack => new(_tracks, _albumTracklist, _audio, _images);

    [Fact]
    public async Task Delete_NonOwner_Is404_AndDeletesNothing()
    {
        (await DeleteTrack.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _audio.DidNotReceiveWithAnyArgs().DeleteAudioAsync(default!);
        await _tracks.DidNotReceiveWithAnyArgs().DeleteTrackAsync(default!, default!);
    }

    [Fact]
    public async Task Delete_RemovesAlbumsThenAudioThenCoverThenTheTrack()
    {
        _tracks.GetTrackAsync(TrackId).Returns(Fakes.Track(TrackId, Owner, imageUrl: "https://cdn/c.jpg"));

        (await DeleteTrack.FunctionHandler(Http.As(Owner), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK);

        Received.InOrder(() =>
        {
            _albumTracklist.RemoveTrackFromAllAlbumsAsync(Owner, TrackId);
            _audio.DeleteAudioAsync(TrackId);
            _images.DeleteImageAsync($"tracks/{TrackId}/cover_400x400.jpg");
            _tracks.DeleteTrackAsync(Owner, TrackId);
        });
    }

    [Fact]
    public async Task Delete_WithoutACover_SkipsTheImageDelete()
    {
        (await DeleteTrack.FunctionHandler(Http.As(Owner), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK);
        await _images.DidNotReceiveWithAnyArgs().DeleteImageAsync(default!);
        await _tracks.Received(1).DeleteTrackAsync(Owner, TrackId);
    }

    // ---------------------------------------------------------------- GET /tracks/{trackId}/stream

    private GetTrackSegmentsLambda.Function Stream => new(_tracks, _shares, _audio);

    [Fact]
    public async Task Stream_WithoutAccess_Is404_AndMintsNoUrl()
    {
        (await Stream.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _audio.DidNotReceiveWithAnyArgs().GetStreamUrlAsync(default!, default);
    }

    [Fact]
    public async Task Stream_ReturnsASixHourUrlAndTheDuration()
    {
        _audio.GetStreamUrlAsync(TrackId, TimeSpan.FromHours(6)).Returns("https://s3/presigned");
        var before = DateTimeOffset.UtcNow;

        var body = (await Stream.FunctionHandler(Http.As(Owner), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("url").GetString().Should().Be("https://s3/presigned");
        body.GetProperty("duration").GetInt32().Should().Be(180);
        var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(body.GetProperty("expiresAt").GetInt64());
        (expiresAt - before).Should().BeCloseTo(TimeSpan.FromHours(6), TimeSpan.FromMinutes(1));
    }

    // ---------------------------------------------------------------- GET /tracks/{trackId}/original

    private GetOriginalTrackLambda.Function Original => new(_tracks, _audio);

    [Fact]
    public async Task Original_WithoutIdentity_Is401()
    {
        (await Original.FunctionHandler(Http.Anonymous(), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await _audio.DidNotReceiveWithAnyArgs().GetOriginalDownloadAsync(default!, default!, default);
    }

    [Fact]
    public async Task Original_UnknownTrack_Is404()
    {
        (await Original.FunctionHandler(Http.As(Owner), _context, "nope")).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    // Unlike streaming, the original is the owner's alone — someone it's shared with gets the
    // same 404 as a stranger, and no URL is ever minted
    [Theory]
    [InlineData("bob")] // a recipient
    [InlineData(Stranger)]
    public async Task Original_IsOwnerOnly(string caller)
    {
        _shares.IsTrackAccessibleToUser(TrackId, "bob").Returns(true);

        (await Original.FunctionHandler(Http.As(caller), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _audio.DidNotReceiveWithAnyArgs().GetOriginalDownloadAsync(default!, default!, default);
    }

    [Fact]
    public async Task Original_ATrackWithNoArchivedOriginal_Is404_SayingSo()
    {
        _audio.GetOriginalDownloadAsync(TrackId, Arg.Any<string>(), Arg.Any<TimeSpan>()).Returns((OriginalDownload?)null);

        var response = (await Original.FunctionHandler(Http.As(Owner), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);

        response.ErrorMessage().Should().Be(GetOriginalTrackLambda.Function.NotAvailableMessage);
    }

    [Fact]
    public async Task Original_GivesTheOwnerAFiveMinuteDownloadNamedAfterTheTrack()
    {
        _audio.GetOriginalDownloadAsync(TrackId, "Track t1", TimeSpan.FromMinutes(5))
            .Returns(new OriginalDownload("https://s3/original", "Track t1.wav", "audio/wav"));
        var before = DateTimeOffset.UtcNow;

        var body = (await Original.FunctionHandler(Http.As("ALICE"), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("url").GetString().Should().Be("https://s3/original");
        body.GetProperty("fileName").GetString().Should().Be("Track t1.wav");
        body.GetProperty("contentType").GetString().Should().Be("audio/wav");
        var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(body.GetProperty("expiresAt").GetInt64());
        (expiresAt - before).Should().BeCloseTo(TimeSpan.FromMinutes(5), TimeSpan.FromSeconds(30));
    }

    // ---------------------------------------------------------------- GET /tracks/{trackId}/likes + /recipients

    [Fact]
    public async Task Likers_AreOwnerOnly()
    {
        var handler = new GetTrackLikesLambda.Function(_tracks, _likes);
        (await handler.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _likes.DidNotReceiveWithAnyArgs().GetTrackLikersAsync(default!, default, default);
    }

    [Fact]
    public async Task Likers_ReturnTheLikeCountAndForwardTheCursor()
    {
        var handler = new GetTrackLikesLambda.Function(_tracks, _likes);
        _likes.GetTrackLikersAsync(TrackId, 25, "c1").Returns(new PaginatedResult<TrackLiker>
        {
            Items = [new TrackLiker { User = Fakes.Summary("bob"), LikedAt = 1 }], NextCursor = "c2",
        });

        var body = (await handler.FunctionHandler(Http.As(Owner, new() { ["cursor"] = "c1" }), _context, TrackId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("likeCount").GetInt32().Should().Be(3);
        body.GetProperty("items").GetArrayLength().Should().Be(1);
        body.GetProperty("nextCursor").GetString().Should().Be("c2");
    }

    [Fact]
    public async Task Recipients_AreOwnerOnly()
    {
        var handler = new GetTrackRecipientsLambda.Function(_tracks, _shares);

        (await handler.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        _shares.GetTrackRecipientDetailsAsync(TrackId)
            .Returns([new Recipient { User = Fakes.Summary("bob"), SharedAt = 1 }]);
        (await handler.FunctionHandler(Http.As(Owner), _context, TrackId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("items").GetArrayLength().Should().Be(1);
    }

    // ---------------------------------------------------------------- listings

    [Theory]
    [InlineData(null, 10)]   // default
    [InlineData("25", 25)]
    [InlineData("500", 100)] // clamped
    [InlineData("0", 1)]
    [InlineData("abc", 10)]
    public async Task MyTracks_ParseAndClampTheLimit(string? limit, int expected)
    {
        var handler = new GetUserTracksLambda.Function(_tracks);
        _tracks.GetTracksByUsername(Owner, Arg.Any<int>(), Arg.Any<string?>()).Returns(Fakes.Page<TrackSummary>());
        var query = new Dictionary<string, string> { ["cursor"] = "c1" };
        if (limit is not null) query["limit"] = limit;

        (await handler.FunctionHandler(Http.As(Owner, query), _context)).ShouldHaveStatus(HttpStatusCode.OK);

        await _tracks.Received(1).GetTracksByUsername(Owner, expected, "c1");
    }

    [Fact]
    public async Task SharedWithMe_IsTheCallersLibrary()
    {
        var handler = new GetTracksSharedWithUserLambda.Function(_shares);
        _shares.GetTracksSharedWithUser("bob", 10, null).Returns(Fakes.Page<SharedTrack>());

        (await handler.FunctionHandler(Http.As("bob"), _context)).ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.Received(1).GetTracksSharedWithUser("bob", 10, null);
    }

    [Fact]
    public async Task SharedFromAUser_IsScopedToTheCaller()
    {
        var handler = new GetTracksSharedFromUserLambda.Function(_shares);
        _shares.GetTracksSharedFromUser(Owner, "bob", 10, "c1").Returns(Fakes.Page<SharedTrack>());

        (await handler.FunctionHandler(Http.As("bob", new() { ["cursor"] = "c1" }), _context, Owner))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.Received(1).GetTracksSharedFromUser(Owner, "bob", 10, "c1");
    }

    [Fact]
    public async Task Library_IsTheCallersWholePlayableLibrary_InOneUnpagedResult()
    {
        var handler = new GetLibraryTracksLambda.Function(_shares);
        _shares.GetLibraryTracksAsync("bob").Returns([]);

        (await handler.FunctionHandler(Http.Anonymous(), _context)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        var response = await handler.FunctionHandler(Http.As("bob"), _context);
        response.ShouldHaveStatus(HttpStatusCode.OK);
        response.Body.Should().Contain("\"nextCursor\":null");
        await _shares.Received(1).GetLibraryTracksAsync("bob");
    }

    [Fact]
    public async Task RemoveFromLibrary_ActsOnTheCaller_AndIsAlways200()
    {
        var handler = new RemoveSharedTrackLambda.Function(_shares);

        (await handler.FunctionHandler(Http.As("bob"), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.Received(1).RemoveTrackFromLibraryAsync(TrackId, "bob");
    }

    // ---------------------------------------------------------------- GET /tracks/uploads/{trackId}

    [Fact]
    public async Task UploadStatus_IsScopedToTheUploader()
    {
        var handler = new GetUploadStatusLambda.Function(_uploads);
        _uploads.GetAsync(Owner, TrackId).Returns(new UploadStatus
        {
            TrackId = TrackId, Status = UploadState.Failed, Error = "not an audio file", CreatedAt = 1,
        });

        (await handler.FunctionHandler(Http.As(Stranger), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        var body = (await handler.FunctionHandler(Http.As(Owner), _context, TrackId)).ShouldHaveStatus(HttpStatusCode.OK).Json();
        (body.GetProperty("status").GetString(), body.GetProperty("error").GetString())
            .Should().Be((UploadState.Failed, "not an audio file"));
    }

    // ---------------------------------------------------------------- POST /tracks/{trackId}/share

    private ShareTrackLambda.Function ShareTrack => new(_tracks, _shares, _users, _validation);

    private void RecipientsAre(params string[] valid) =>
        _users.GetValidatedRecipientsAsync(Arg.Any<List<string>>(), Owner).Returns([.. valid]);

    [Fact]
    public async Task Share_NonOwner_Is404()
    {
        (await ShareTrack.FunctionHandler(Http.As(Stranger), _context, TrackId, new ShareTrackRequest { Add = ["bob"] }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _shares.DidNotReceiveWithAnyArgs().ShareTrackAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Share_InvalidRequest_Is400()
    {
        _validation.ValidateShare(Arg.Any<ShareTrackRequest>()).Throws(new ArgumentException("provide at least one user"));

        (await ShareTrack.FunctionHandler(Http.As(Owner), _context, TrackId, new ShareTrackRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Share_AddsValidatedRecipients_WithTheCaption_AndReportsTheResultingList()
    {
        _shares.GetTrackRecipientsAsync(TrackId).Returns(["carol"]);
        RecipientsAre("bob");

        var body = (await ShareTrack.FunctionHandler(Http.As(Owner), _context, TrackId,
                new ShareTrackRequest { Add = ["bob", "ghost"], Caption = "listen" }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("sharedWith").EnumerateArray().Select(e => e.GetString()).Should().Equal("bob", "carol");
        await _shares.Received(1).ShareTrackAsync(TrackId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.SequenceEqual(new[] { "bob" })),
            Arg.Is<IReadOnlyList<string>>(r => r.Count == 0), "listen");
    }

    [Fact]
    public async Task Share_RemoveWins_OverAddForTheSameUser()
    {
        _shares.GetTrackRecipientsAsync(TrackId).Returns(["bob"]);
        RecipientsAre("bob");

        var body = (await ShareTrack.FunctionHandler(Http.As(Owner), _context, TrackId,
                new ShareTrackRequest { Add = ["bob"], Remove = ["BOB"] }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("sharedWith").GetArrayLength().Should().Be(0);
        await _shares.Received(1).ShareTrackAsync(TrackId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.Count == 0),
            Arg.Is<IReadOnlyList<string>>(r => r.SequenceEqual(new[] { "bob" })), null); // typed casing → the stored key
    }

    [Fact]
    public async Task Share_PastFiftyRecipientsInTotal_IsAllowed()
    {
        // The 50 cap is per request (validator); a track has no total recipient cap.
        _shares.GetTrackRecipientsAsync(TrackId).Returns(Enumerable.Range(0, 50).Select(i => $"u{i}").ToList());
        RecipientsAre("newcomer");

        (await ShareTrack.FunctionHandler(Http.As(Owner), _context, TrackId, new ShareTrackRequest { Add = ["newcomer"] }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json()
            .GetProperty("sharedWith").GetArrayLength().Should().Be(51);
        await _shares.Received(1).ShareTrackAsync(TrackId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.SequenceEqual(new[] { "newcomer" })),
            Arg.Is<IReadOnlyList<string>>(r => r.Count == 0), null);
    }

    // ---------------------------------------------------------------- POST /tracks/upload

    private readonly IAmazonStepFunctions _stepFunctions = Substitute.For<IAmazonStepFunctions>();

    private UploadTrackLambda.Function UploadTrack
    {
        get
        {
            Environment.SetEnvironmentVariable("STATE_MACHINE_ARN", "arn:aws:states:eu-west-1:0:stateMachine:test");
            return new UploadTrackLambda.Function(_validation, _users, _uploads, _stepFunctions);
        }
    }

    [Fact]
    public async Task Upload_IsAccepted_WithAStatusRecordWrittenBeforeTheStateMachineStarts()
    {
        _users.GetValidatedRecipientsAsync(Arg.Any<List<string>>(), Owner).Returns(["bob"]);
        _stepFunctions.StartExecutionAsync(Arg.Any<StartExecutionRequest>()).Returns(new StartExecutionResponse());

        var response = await UploadTrack.FunctionHandler(Http.As(Owner), _context,
            new UploadTrackRequest { Name = "Song", AudioKey = "alice/a.wav", SharedWith = ["bob", "ghost"] });

        var body = response.ShouldHaveStatus(HttpStatusCode.Accepted).Json();
        var trackId = body.GetProperty("trackId").GetString()!;
        body.GetProperty("status").GetString().Should().Be(UploadState.Processing);
        Received.InOrder(() =>
        {
            _uploads.CreateProcessingAsync(Owner, trackId);
            _stepFunctions.StartExecutionAsync(Arg.Any<StartExecutionRequest>());
        });
        await _stepFunctions.Received(1).StartExecutionAsync(Arg.Is<StartExecutionRequest>(r =>
            r.StateMachineArn.EndsWith(":test") && r.Input.Contains(trackId) && r.Input.Contains("\"bob\"") &&
            !r.Input.Contains("ghost")));
    }

    [Fact]
    public async Task Upload_FailingValidation_Is400_AndStartsNothing()
    {
        _validation.ValidateUploadedAudioAsync("alice/a.wav", Owner).ThrowsAsync(new ArgumentException("No uploaded audio found"));

        (await UploadTrack.FunctionHandler(Http.As(Owner), _context, new UploadTrackRequest { Name = "Song", AudioKey = "alice/a.wav" }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _uploads.DidNotReceiveWithAnyArgs().CreateProcessingAsync(default!, default!);
        await _stepFunctions.DidNotReceiveWithAnyArgs().StartExecutionAsync(default(StartExecutionRequest)!);
    }

    [Fact]
    public async Task Upload_WithSomeoneElsesCoverKey_Is400()
    {
        (await UploadTrack.FunctionHandler(Http.As(Owner), _context,
                new UploadTrackRequest { Name = "Song", AudioKey = "alice/a.wav", ImageKey = "bob/cover.png" }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest).ErrorMessage().Should().Contain("only use files you uploaded");
        await _stepFunctions.DidNotReceiveWithAnyArgs().StartExecutionAsync(default(StartExecutionRequest)!);
    }

    // ---------------------------------------------------------------- GET /buckets/dropbox

    private GetDropboxPresignedUrlLambda.Function Presign => new(_dropbox);

    [Fact]
    public async Task Presign_StagesUnderTheCallersPrefix_ForAnHour()
    {
        _dropbox.GetPresignedPutUrlAsync("alice/staged/a.wav", TimeSpan.FromHours(1)).Returns("https://s3/put");

        var body = (await Presign.FunctionHandler(Http.As(Owner, new() { ["key"] = "staged/a.wav" }), _context))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("url").GetString(), body.GetProperty("key").GetString())
            .Should().Be(("https://s3/put", "alice/staged/a.wav"));
    }

    [Theory]
    [InlineData(null)]           // no query string at all
    [InlineData("other")]        // a query string, but no key
    public async Task Presign_WithoutAKey_Is400(string? otherParam)
    {
        var query = otherParam is null ? null : new Dictionary<string, string> { [otherParam] = "1" };

        (await Presign.FunctionHandler(Http.As(Owner, query), _context)).ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Presign_OverlongKey_Is400()
    {
        (await Presign.FunctionHandler(Http.As(Owner, new() { ["key"] = new string('k', 513) }), _context))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _dropbox.DidNotReceiveWithAnyArgs().GetPresignedPutUrlAsync(default!, default);
    }

    [Fact]
    public async Task Presign_WithoutIdentity_Is401()
    {
        (await Presign.FunctionHandler(Http.Anonymous(new() { ["key"] = "a.wav" }), _context))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
