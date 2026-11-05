using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;
using Ports.Services;
using Ports.Validation;

namespace Lambda.Tests.Handlers;

// Playlists are private: every lookup is scoped to the caller, so another user's playlist is
// simply not found. The built-in likes playlist rejects every direct edit.
public class PlaylistHandlerTests
{
    private const string Owner = "alice";
    private const string PlaylistId = "p1";
    private const string LikesId = "likes";

    private readonly IPlaylistRepository _playlists = Substitute.For<IPlaylistRepository>();
    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private readonly ISharedTrackRepository _shares = Substitute.For<ISharedTrackRepository>();
    private readonly ILikeRepository _likes = Substitute.For<ILikeRepository>();
    private readonly IImageService _images = Substitute.For<IImageService>();
    private readonly IPlaylistValidationService _validation = Substitute.For<IPlaylistValidationService>();
    private readonly TestLambdaContext _context = new();

    public PlaylistHandlerTests()
    {
        _playlists.GetPlaylistAsync(Owner, PlaylistId).Returns(_ => Fakes.Playlist(PlaylistId));
        _playlists.GetPlaylistAsync(Owner, LikesId).Returns(_ => Fakes.Playlist(LikesId, PlaylistType.Likes));
        _validation.ValidateCreate(Arg.Any<CreatePlaylistRequest>()).Returns(c => c.Arg<CreatePlaylistRequest>());
        _validation.ValidateUpdate(Arg.Any<UpdatePlaylistRequest>()).Returns(c => c.Arg<UpdatePlaylistRequest>());
    }

    // ---------------------------------------------------------------- likes playlist is read-only

    [Fact]
    public async Task LikesPlaylist_RejectsEveryDirectEdit()
    {
        var add = new AddPlaylistTrackLambda.Function(_playlists, _tracks, _shares);
        var remove = new RemovePlaylistTrackLambda.Function(_playlists);
        var set = new SetPlaylistTracksLambda.Function(_playlists);
        var update = new UpdatePlaylistLambda.Function(_playlists, _validation, _images);
        var delete = new DeletePlaylistLambda.Function(_playlists, _images);

        (await add.FunctionHandler(Http.As(Owner), _context, LikesId, "t1")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await remove.FunctionHandler(Http.As(Owner), _context, LikesId, "t1")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await set.FunctionHandler(Http.As(Owner), _context, LikesId, new SetPlaylistTracksLambda.SetPlaylistTracksRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await update.FunctionHandler(Http.As(Owner), _context, LikesId, new UpdatePlaylistRequest { Name = "x" }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await delete.FunctionHandler(Http.As(Owner), _context, LikesId)).ShouldHaveStatus(HttpStatusCode.BadRequest);

        await _playlists.DidNotReceiveWithAnyArgs().AddTrackAsync(default!, default!, default!);
        await _playlists.DidNotReceiveWithAnyArgs().RemoveTrackAsync(default!, default!, default!);
        await _playlists.DidNotReceiveWithAnyArgs().SetTracksAsync(default!, default!, default!);
        await _playlists.DidNotReceiveWithAnyArgs().DeletePlaylistAsync(default!, default!);
    }

    [Fact]
    public async Task SomeoneElsesPlaylist_IsNotFound()
    {
        var get = new GetPlaylistLambda.Function(_playlists, _shares, _likes);

        (await get.FunctionHandler(Http.As("bob"), _context, PlaylistId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _playlists.Received(1).GetPlaylistAsync("bob", PlaylistId);
    }

    // ---------------------------------------------------------------- POST /playlists/{id}/tracks/{trackId}

    private AddPlaylistTrackLambda.Function Add => new(_playlists, _tracks, _shares);

    [Fact]
    public async Task Add_ATrackYouCantAccess_Is400_AndAddsNothing()
    {
        _tracks.GetTrackAsync("t1").Returns(Fakes.Track("t1", "bob"));

        (await Add.FunctionHandler(Http.As(Owner), _context, PlaylistId, "t1")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await Add.FunctionHandler(Http.As(Owner), _context, PlaylistId, "missing")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _playlists.DidNotReceiveWithAnyArgs().AddTrackAsync(default!, default!, default!);
    }

    [Fact]
    public async Task Add_ASharedTrack_ReportsWhetherItWasNew()
    {
        var track = Fakes.Track("t1", "bob");
        _tracks.GetTrackAsync("t1").Returns(track);
        _shares.IsTrackAccessibleToUser("t1", Owner).Returns(true);
        _playlists.AddTrackAsync(Owner, PlaylistId, track).Returns(false); // already a member

        var body = (await Add.FunctionHandler(Http.As(Owner), _context, PlaylistId, "t1"))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("trackId").GetString(), body.GetProperty("added").GetBoolean()).Should().Be(("t1", false));
    }

    [Fact]
    public async Task Add_YourOwnTrack_SkipsTheAccessCheck()
    {
        var track = Fakes.Track("t1", Owner);
        _tracks.GetTrackAsync("t1").Returns(track);
        _playlists.AddTrackAsync(Owner, PlaylistId, track).Returns(true);

        (await Add.FunctionHandler(Http.As(Owner), _context, PlaylistId, "t1")).ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.DidNotReceiveWithAnyArgs().IsTrackAccessibleToUser(default!, default!);
    }

    // ---------------------------------------------------------------- remove / set

    [Fact]
    public async Task Remove_NeedsNoAccessCheck_SoDeadPlaceholdersStayRemovable()
    {
        var remove = new RemovePlaylistTrackLambda.Function(_playlists);
        _playlists.RemoveTrackAsync(Owner, PlaylistId, "T1").Returns(true);

        var body = (await remove.FunctionHandler(Http.As(Owner), _context, PlaylistId, "T1"))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("trackId").GetString(), body.GetProperty("removed").GetBoolean()).Should().Be(("t1", true));
        await _tracks.DidNotReceiveWithAnyArgs().GetTrackAsync(default!);
    }

    [Fact]
    public async Task Set_NormalisesAndDedupesIds_AndReportsRemovals()
    {
        var set = new SetPlaylistTracksLambda.Function(_playlists);
        _playlists.SetTracksAsync(Owner, PlaylistId, Arg.Any<IReadOnlyList<string>>()).Returns(1);

        var body = (await set.FunctionHandler(Http.As(Owner), _context, PlaylistId,
                new SetPlaylistTracksLambda.SetPlaylistTracksRequest { TrackIds = ["B", "a", "b"] }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("trackCount").GetInt32(), body.GetProperty("removed").GetInt32()).Should().Be((2, 1));
        await _playlists.Received(1).SetTracksAsync(Owner, PlaylistId,
            Arg.Is<IReadOnlyList<string>>(ids => ids.SequenceEqual(new[] { "b", "a" })));
    }

    [Fact]
    public async Task Set_MoreThan500Tracks_Is400()
    {
        var set = new SetPlaylistTracksLambda.Function(_playlists);

        (await set.FunctionHandler(Http.As(Owner), _context, PlaylistId,
                new SetPlaylistTracksLambda.SetPlaylistTracksRequest { TrackIds = Enumerable.Range(0, 501).Select(i => $"t{i}").ToList() }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _playlists.DidNotReceiveWithAnyArgs().GetPlaylistAsync(default!, default!);
    }

    [Fact]
    public async Task Set_WithANonMember_Is400_FromTheRepository()
    {
        var set = new SetPlaylistTracksLambda.Function(_playlists);
        _playlists.SetTracksAsync(Owner, PlaylistId, Arg.Any<IReadOnlyList<string>>())
            .ThrowsAsync(new ArgumentException("tracks not in the playlist: x"));

        (await set.FunctionHandler(Http.As(Owner), _context, PlaylistId,
                new SetPlaylistTracksLambda.SetPlaylistTracksRequest { TrackIds = ["x"] }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest).ErrorMessage().Should().Contain("x");
    }

    // ---------------------------------------------------------------- GET /playlists/{id}

    private GetPlaylistLambda.Function Get => new(_playlists, _shares, _likes);

    [Fact]
    public async Task Get_Custom_MarksTracksYouLostAccessToAsRevoked()
    {
        _playlists.GetPlaylistTracksAsync(PlaylistId, Owner, 10, null).Returns(Fakes.Page(
            Entry("mine", Fakes.TrackSummary("mine", Owner)),
            Entry("revoked", Fakes.TrackSummary("revoked", "bob")),
            Entry("still-shared", Fakes.TrackSummary("still-shared", "bob")),
            new PlaylistTrackEntry
            {
                TrackId = "gone", Name = "Gone", Duration = 10, AddedAt = 1, Unavailable = true,
                Reason = PlaylistTrackReason.Deleted,
            }));
        _shares.IsTrackAccessibleToUser("still-shared", Owner).Returns(true);

        var items = (await Get.FunctionHandler(Http.As(Owner), _context, PlaylistId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("tracks").GetProperty("items")
            .EnumerateArray().ToList();

        items.Select(i => (i.GetProperty("trackId").GetString(), i.GetProperty("unavailable").GetBoolean()))
            .Should().Equal(("mine", false), ("revoked", true), ("still-shared", false), ("gone", true));
        items[1].GetProperty("reason").GetString().Should().Be(PlaylistTrackReason.Revoked);
        items[1].TryGetProperty("track", out _).Should().BeFalse(); // revoked: no playable track
        items[3].GetProperty("reason").GetString().Should().Be(PlaylistTrackReason.Deleted);
    }

    [Fact]
    public async Task Get_Likes_DropsInaccessibleTracks_AndUsesWhenTheyWereLiked()
    {
        _likes.GetLikedTracksAsync(Owner, 10, null).Returns(new PaginatedResult<LikedTrack>
        {
            Items =
            [
                new LikedTrack(Fakes.TrackSummary("ok", "bob"), LikedAt: 555),
                new LikedTrack(Fakes.TrackSummary("unshared", "bob"), LikedAt: 444),
            ],
            NextCursor = "next",
        });
        _shares.IsTrackAccessibleToUser("ok", Owner).Returns(true);

        var tracks = (await Get.FunctionHandler(Http.As(Owner), _context, LikesId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("tracks");

        var item = tracks.GetProperty("items").EnumerateArray().Should().ContainSingle().Subject;
        (item.GetProperty("trackId").GetString(), item.GetProperty("addedAt").GetInt64()).Should().Be(("ok", 555L));
        tracks.GetProperty("nextCursor").GetString().Should().Be("next");
    }

    [Theory]
    [InlineData(null, 10)]
    [InlineData("100", 100)]
    [InlineData("500", 100)]
    [InlineData("0", 1)]
    public async Task Get_PassesTheClampedLimitThrough(string? limit, int expected)
    {
        _playlists.GetPlaylistTracksAsync(PlaylistId, Owner, Arg.Any<int>(), Arg.Any<string?>()).Returns(Fakes.Page<PlaylistTrackEntry>());
        _likes.GetLikedTracksAsync(Owner, Arg.Any<int>(), Arg.Any<string?>())
            .Returns(new PaginatedResult<LikedTrack> { Items = [] });
        var query = limit is null ? null : new Dictionary<string, string> { ["limit"] = limit };

        (await Get.FunctionHandler(Http.As(Owner, query), _context, PlaylistId)).ShouldHaveStatus(HttpStatusCode.OK);
        (await Get.FunctionHandler(Http.As(Owner, query), _context, LikesId)).ShouldHaveStatus(HttpStatusCode.OK);

        await _playlists.Received(1).GetPlaylistTracksAsync(PlaylistId, Owner, expected, null);
        await _likes.Received(1).GetLikedTracksAsync(Owner, expected, null);
    }

    private static PlaylistTrackEntry Entry(string id, TrackSummary track) => new()
    {
        TrackId = id, Name = track.Name, Duration = track.Duration, AddedAt = 1, Unavailable = false, Track = track,
    };

    // ---------------------------------------------------------------- create / update / delete / list

    [Fact]
    public async Task Create_Is201_WithTheCoverProcessedToTheNewId()
    {
        var create = new CreatePlaylistLambda.Function(_playlists, _validation, _images);
        string? coverKey = null;
        _images.ProcessImageAsync(Arg.Is(Owner), Arg.Is("alice/c.png"), Arg.Do<string>(k => coverKey = k),
                Arg.Is(400), Arg.Is(400))
            .Returns(new ImageProcessingResult("#fff", "https://cdn/c.jpg"));
        _playlists.CreatePlaylistAsync(Arg.Any<string>(), Arg.Is(Owner), Arg.Is("Mix"), Arg.Any<string?>(),
                Arg.Any<ImageProcessingResult?>())
            .Returns(c => Fakes.Playlist(c.ArgAt<string>(0)));

        var body = (await create.FunctionHandler(Http.As(Owner), _context,
                new CreatePlaylistRequest { Name = "Mix", ImageKey = "alice/c.png" }))
            .ShouldHaveStatus(HttpStatusCode.Created).Json();

        coverKey.Should().Be($"playlists/{body.GetProperty("id").GetString()}/cover_400x400.jpg");
    }

    [Fact]
    public async Task Create_InvalidRequest_Is400()
    {
        var create = new CreatePlaylistLambda.Function(_playlists, _validation, _images);
        _validation.ValidateCreate(Arg.Any<CreatePlaylistRequest>()).Throws(new ArgumentException("name is required"));

        (await create.FunctionHandler(Http.As(Owner), _context, new CreatePlaylistRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_PassesTheValidatedChange()
    {
        var update = new UpdatePlaylistLambda.Function(_playlists, _validation, _images);
        _playlists.UpdatePlaylistAsync(Owner, PlaylistId, "Renamed", null, null, false).Returns(Fakes.Playlist(PlaylistId));

        (await update.FunctionHandler(Http.As(Owner), _context, PlaylistId, new UpdatePlaylistRequest { Name = "Renamed" }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _playlists.Received(1).UpdatePlaylistAsync(Owner, PlaylistId, "Renamed", null, null, false);
    }

    [Fact]
    public async Task Delete_RemovesTheCoverIfAny_ThenThePlaylist()
    {
        var delete = new DeletePlaylistLambda.Function(_playlists, _images);
        _playlists.GetPlaylistAsync(Owner, PlaylistId).Returns(Fakes.Playlist(PlaylistId) with { ImageUrl = "https://cdn/c.jpg" });

        (await delete.FunctionHandler(Http.As(Owner), _context, PlaylistId)).ShouldHaveStatus(HttpStatusCode.OK);

        Received.InOrder(() =>
        {
            _images.DeleteImageAsync($"playlists/{PlaylistId}/cover_400x400.jpg");
            _playlists.DeletePlaylistAsync(Owner, PlaylistId);
        });
    }

    [Fact]
    public async Task List_IsTheCallersOwn_WithLimitAndCursor()
    {
        _playlists.GetPlaylistsAsync(Owner, 50, "c1").Returns(Fakes.Page<Playlist>());

        (await new GetPlaylistsLambda.Function(_playlists).FunctionHandler(
                Http.As(Owner, new() { ["limit"] = "50", ["cursor"] = "c1" }), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _playlists.Received(1).GetPlaylistsAsync(Owner, 50, "c1");
    }

    [Fact]
    public async Task WithoutIdentity_Is401()
    {
        (await new GetPlaylistsLambda.Function(_playlists).FunctionHandler(Http.Anonymous(), _context))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
        (await Add.FunctionHandler(Http.Anonymous(), _context, PlaylistId, "t1")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
