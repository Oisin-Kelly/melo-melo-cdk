using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;
using Ports.Services;
using Ports.Validation;

namespace Lambda.Tests.Handlers;

// Profiles, follows, search, resume progress, and the private seen markers
public class UserHandlerTests
{
    private const string Me = "alice";
    private const string Them = "bob";

    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IFollowRepository _follows = Substitute.For<IFollowRepository>();
    private readonly ISharedTrackRepository _shares = Substitute.For<ISharedTrackRepository>();
    private readonly IProgressRepository _progress = Substitute.For<IProgressRepository>();
    private readonly IImageService _images = Substitute.For<IImageService>();
    private readonly IUserValidationService _validation = Substitute.For<IUserValidationService>();
    private readonly TestLambdaContext _context = new();

    public UserHandlerTests()
    {
        _users.GetUserByUsername(Me).Returns(_ => Fakes.User(Me));
        _users.GetUserByUsername(Them).Returns(_ => Fakes.User(Them));
        _validation.ValidateUser(Arg.Any<User>()).Returns(c => c.Arg<User>());
    }

    // ---------------------------------------------------------------- GET /users/{username}

    private GetUserLambda.Function GetUser => new(_users, _shares);

    [Fact]
    public async Task OwnProfile_CarriesThePrivateSeenMarkers_InAnyCasing()
    {
        _users.GetSeenMarkersAsync(Me).Returns((111L, 222L));

        // both the path and the claim arrive mixed-case; both normalise to "alice"
        var body = (await GetUser.FunctionHandler(Http.As("Alice"), _context, "ALICE")).ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("lastSeenAt").GetInt64(), body.GetProperty("activitySeenAt").GetInt64()).Should().Be((111L, 222L));
        body.TryGetProperty("sharedWithYouCount", out _).Should().BeFalse();
        await _shares.DidNotReceiveWithAnyArgs().CountTracksSharedFromUser(default!, default!);
    }

    [Fact]
    public async Task SomeoneElsesProfile_HidesSeenMarkers_AndCountsWhatTheyShareWithYou()
    {
        _shares.CountTracksSharedFromUser(Them, Me).Returns(7);

        var body = (await GetUser.FunctionHandler(Http.As(Me), _context, Them)).ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("sharedWithYouCount").GetInt32().Should().Be(7);
        body.TryGetProperty("lastSeenAt", out _).Should().BeFalse();
        await _users.DidNotReceiveWithAnyArgs().GetSeenMarkersAsync(default!);
    }

    [Fact]
    public async Task UnknownUser_Is404_BlankUsername_Is400_NoIdentity_Is401()
    {
        (await GetUser.FunctionHandler(Http.As(Me), _context, "ghost")).ShouldHaveStatus(HttpStatusCode.NotFound);
        (await GetUser.FunctionHandler(Http.As(Me), _context, " ")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await GetUser.FunctionHandler(Http.Anonymous(), _context, Them)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    // ---------------------------------------------------------------- username normalisation

    [Fact]
    public async Task UsernamesInPathsAndClaims_AreLowercasedBeforeAnyLookup()
    {
        (await Follow.FunctionHandler(Http.As("ALICE"), _context, " Bob ",
                new FollowUserLambda.FollowUserRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.OK);

        await _users.Received(1).GetUserByUsername(Them);
        await _follows.Received(1).FollowUser(Them, Me); // keys built from the one lowercase spelling
    }

    [Fact]
    public async Task Followers_ReadThroughAnyCasing()
    {
        var handler = new GetUserFollowersLambda.Function(_users, _follows);
        _users.GetUserByUsername(Them).Returns(Fakes.User(Them));
        _follows.GetUserFollowers(Them, 10, null).Returns(Fakes.Page<UserSummary>());

        (await handler.FunctionHandler(Http.As(Me), _context, "BOB")).ShouldHaveStatus(HttpStatusCode.OK);
        await _follows.Received(1).GetUserFollowers(Them, 10, null);
    }

    // ---------------------------------------------------------------- POST /users/{username}/follow-user

    private FollowUserLambda.Function Follow => new(_users, _follows);

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Follow_AndUnfollow_ActOnTheCallerAsFollower(bool newValue)
    {
        var body = (await Follow.FunctionHandler(Http.As(Me), _context, Them,
                new FollowUserLambda.FollowUserRequest { NewValue = newValue }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("newValue").GetBoolean().Should().Be(newValue);
        if (newValue) await _follows.Received(1).FollowUser(Them, Me);
        else await _follows.Received(1).UnfollowUser(Them, Me);
    }

    [Theory]
    [InlineData("alice")]
    [InlineData("ALICE")]
    public async Task FollowingYourself_Is400_InAnyCasing_WithoutTouchingTheGraph(string target)
    {
        (await Follow.FunctionHandler(Http.As(Me), _context, target, new FollowUserLambda.FollowUserRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest).ErrorMessage().Should().Contain("can't follow yourself");
        await _follows.DidNotReceiveWithAnyArgs().FollowUser(default!, default!);
        await _users.DidNotReceiveWithAnyArgs().GetUserByUsername(default!);
    }

    [Fact]
    public async Task Follow_UnknownUser_Is404_MissingNewValue_Is400()
    {
        (await Follow.FunctionHandler(Http.As(Me), _context, "ghost", new FollowUserLambda.FollowUserRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        (await Follow.FunctionHandler(Http.As(Me), _context, Them, new FollowUserLambda.FollowUserRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _follows.DidNotReceiveWithAnyArgs().FollowUser(default!, default!);
    }

    [Fact]
    public async Task FollowStatus_AsksWhetherTheCallerFollowsThem()
    {
        _follows.GetFollowStatus(Them, Me).Returns(new UserFollow { FollowStatus = true, CreatedAt = 5 });

        var body = (await new IsFollowingUserLambda.Function(_follows).FunctionHandler(Http.As(Me), _context, Them))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("followStatus").GetBoolean().Should().BeTrue();
    }

    // ---------------------------------------------------------------- followers / followings

    [Fact]
    public async Task Followers_AreVisibleToAnyoneSignedIn()
    {
        var handler = new GetUserFollowersLambda.Function(_users, _follows);
        _users.GetUserByUsername(Them).Returns(Fakes.User(Them));
        _follows.GetUserFollowers(Them, 10, null).Returns(Fakes.Page<UserSummary>());

        (await handler.FunctionHandler(Http.As(Me), _context, Them)).ShouldHaveStatus(HttpStatusCode.OK);
        await _follows.Received(1).GetUserFollowers(Them, 10, null);
    }

    [Fact]
    public async Task PublicFollowings_PageWithTheCursor()
    {
        var handler = new GetUserFollowingLambda.Function(_users, _follows);
        _follows.GetUserFollowings(Them, 10, "c1").Returns(Fakes.Page(Fakes.Summary("carol")));

        (await handler.FunctionHandler(Http.As(Me, new() { ["cursor"] = "c1" }), _context, Them))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("items").GetArrayLength().Should().Be(1);
    }

    // ---------------------------------------------------------------- GET /users/search

    private SearchUsersLambda.Function Search => new(_users);

    [Fact]
    public async Task Search_NormalisesTheQuery_AndForwardsLimitAndCursor()
    {
        _users.SearchUsersAsync("ali", 25, "c1").Returns(Fakes.Page<UserSummary>());

        (await Search.FunctionHandler(Http.As(Me, new() { ["q"] = "  ALI ", ["limit"] = "25", ["cursor"] = "c1" }), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _users.Received(1).SearchUsersAsync("ali", 25, "c1");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("ali ce")]
    [InlineData("a#b")]       // '#' would reach into the key format
    [InlineData("a*")]
    public async Task Search_RejectsEmptyOrUnsafeQueries(string? q)
    {
        var query = q is null ? null : new Dictionary<string, string> { ["q"] = q };

        (await Search.FunctionHandler(Http.As(Me, query), _context)).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _users.DidNotReceiveWithAnyArgs().SearchUsersAsync(default!, default, default);
    }

    // ---------------------------------------------------------------- POST /profile/update

    private UpdateUserProfileLambda.Function UpdateProfile => new(_users, _images, _validation);

    [Fact]
    public async Task UpdateProfile_BuildsTheUserFromTheRequest_ForTheCallerOnly()
    {
        User? saved = null;
        _users.UpdateUser(Arg.Do<User>(u => saved = u), false).Returns(c => c.Arg<User>());

        (await UpdateProfile.FunctionHandler(Http.As(Me), _context,
                new UpdateUserProfileLambda.UpdateProfileRequest
                {
                    DisplayName = "Alice", Bio = "hi", IncomingShares = IncomingSharesSetting.Following,
                }))
            .ShouldHaveStatus(HttpStatusCode.OK);

        saved!.Username.Should().Be(Me);
        (saved.DisplayName, saved.Bio, saved.IncomingShares)
            .Should().Be(("Alice", "hi", IncomingSharesSetting.Following));
    }

    [Fact]
    public async Task UpdateProfile_NewPictureGoesToTheCallersProfileKey()
    {
        var image = new ImageProcessingResult("#abcdef", "https://cdn/p.jpg");
        _images.ProcessImageAsync(Me, "alice/me.png", $"users/{Me}/profile_400x400.jpg", 400, 400).Returns(image);
        User? saved = null;
        _users.UpdateUser(Arg.Do<User>(u => saved = u), false).Returns(c => c.Arg<User>());

        (await UpdateProfile.FunctionHandler(Http.As(Me), _context,
                new UpdateUserProfileLambda.UpdateProfileRequest { ImageKey = "alice/me.png" }))
            .ShouldHaveStatus(HttpStatusCode.OK);

        (saved!.ImageUrl, saved.ImageBgColor).Should().Be(("https://cdn/p.jpg", "#abcdef"));
    }

    [Fact]
    public async Task UpdateProfile_Invalid_Is400_AndSavesNothing()
    {
        _validation.ValidateUser(Arg.Any<User>()).ThrowsAsync(new ArgumentException("incomingShares must be one of"));

        (await UpdateProfile.FunctionHandler(Http.As(Me), _context,
                new UpdateUserProfileLambda.UpdateProfileRequest { IncomingShares = "FRIENDS" }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _users.DidNotReceiveWithAnyArgs().UpdateUser(default!, default);
    }

    [Fact]
    public async Task UpdateProfile_SomeoneElsesPicture_Is400()
    {
        _images.ProcessImageAsync(Me, "bob/x.png", Arg.Any<string>(), 400, 400)
            .ThrowsAsync(new ArgumentException("You can only use files you uploaded."));

        (await UpdateProfile.FunctionHandler(Http.As(Me), _context,
                new UpdateUserProfileLambda.UpdateProfileRequest { ImageKey = "bob/x.png" }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    // ---------------------------------------------------------------- resume progress

    [Fact]
    public async Task GetProgress_NothingToResume_Is204WithNoBody()
    {
        var response = await new GetProgressLambda.Function(_progress).FunctionHandler(Http.As(Me), _context);

        response.StatusCode.Should().Be(204);
        response.Body.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task GetProgress_ReturnsTheSlot()
    {
        _progress.GetResolvableAsync(Me).Returns(new ProgressEntry
        {
            ContextType = "ALBUM", ContextId = "a1", TrackId = "t1", PositionSeconds = 42, UpdatedAt = 1,
            Track = Fakes.TrackSummary("t1", Them),
        });

        var body = (await new GetProgressLambda.Function(_progress).FunctionHandler(Http.As(Me), _context))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("positionSeconds").GetInt32().Should().Be(42);
    }

    private UpdateProgressLambda.Function UpdateProgress => new(_progress);

    [Fact]
    public async Task UpdateProgress_NormalisesTheContextType_AndUpserts()
    {
        (await UpdateProgress.FunctionHandler(Http.As(Me), _context,
                new UpdateProgressRequest { ContextType = " album ", ContextId = "a1", TrackId = "t1", PositionSeconds = 30 }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _progress.Received(1).UpsertAsync(Me, ProgressContextType.Album, "a1", "t1", 30);
    }

    [Fact]
    public async Task UpdateProgress_Completed_ClearsTheSlot_IgnoringOtherFields()
    {
        (await UpdateProgress.FunctionHandler(Http.As(Me), _context, new UpdateProgressRequest { Completed = true }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _progress.Received(1).ClearAsync(Me);
        await _progress.DidNotReceiveWithAnyArgs().UpsertAsync(default!, default!, default!, default!, default);
    }

    public static TheoryData<UpdateProgressRequest> InvalidProgress => new()
    {
        new UpdateProgressRequest { ContextType = "SONG", ContextId = "x", TrackId = "t", PositionSeconds = 1 },
        new UpdateProgressRequest { ContextType = "TRACK", TrackId = "t", PositionSeconds = 1 },
        new UpdateProgressRequest { ContextType = "TRACK", ContextId = "x", PositionSeconds = 1 },
        new UpdateProgressRequest { ContextType = "TRACK", ContextId = "x", TrackId = "t" },
        new UpdateProgressRequest { ContextType = "TRACK", ContextId = "x", TrackId = "t", PositionSeconds = -1 },
    };

    [Theory]
    [MemberData(nameof(InvalidProgress))]
    public async Task UpdateProgress_InvalidHeartbeat_Is400(UpdateProgressRequest request)
    {
        (await UpdateProgress.FunctionHandler(Http.As(Me), _context, request)).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _progress.DidNotReceiveWithAnyArgs().UpsertAsync(default!, default!, default!, default!, default);
    }

    // ---------------------------------------------------------------- seen markers

    [Fact]
    public async Task MarkSeen_StampsTheCaller()
    {
        (await new MarkSeenLambda.Function(_users).FunctionHandler(Http.As(Me), _context)).ShouldHaveStatus(HttpStatusCode.OK);
        await _users.Received(1).MarkSeenAsync(Me);
        (await new MarkSeenLambda.Function(_users).FunctionHandler(Http.Anonymous(), _context))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
