using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;
using Ports.Services;
using Ports.Validation;

namespace Lambda.Tests.Handlers;

public class AlbumHandlerTests
{
    private const string Owner = "alice";
    private const string Stranger = "mallory";
    private const string AlbumId = "a1";

    private readonly IAlbumRepository _albums = Substitute.For<IAlbumRepository>();
    private readonly IAlbumShareRepository _shares = Substitute.For<IAlbumShareRepository>();
    private readonly IAlbumTracklistRepository _tracklist = Substitute.For<IAlbumTracklistRepository>();
    private readonly IAlbumLikeRepository _likes = Substitute.For<IAlbumLikeRepository>();
    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IImageService _images = Substitute.For<IImageService>();
    private readonly IAlbumValidationService _validation = Substitute.For<IAlbumValidationService>();
    private readonly TestLambdaContext _context = new();

    public AlbumHandlerTests()
    {
        _albums.GetAlbumByIdAsync(AlbumId).Returns(_ => Fakes.Album(AlbumId, Owner));
        _validation.ValidateCreate(Arg.Any<CreateAlbumRequest>()).Returns(c => c.Arg<CreateAlbumRequest>());
        _validation.ValidateUpdate(Arg.Any<UpdateAlbumRequest>()).Returns(c => c.Arg<UpdateAlbumRequest>());
        _validation.ValidateShare(Arg.Any<ShareAlbumRequest>()).Returns(c => c.Arg<ShareAlbumRequest>());
        _validation.ValidateSetTracksAsync(Arg.Any<string>(), Arg.Any<SetAlbumTracksRequest>())
            .Returns(c => c.Arg<SetAlbumTracksRequest>());
    }

    // ---------------------------------------------------------------- GET /albums/{albumId}

    private GetAlbumLambda.Function GetAlbum => new(_albums, _shares, _tracklist, _likes, _users);

    [Fact]
    public async Task Get_WithoutIdentity_Is401()
    {
        (await GetAlbum.FunctionHandler(Http.Anonymous(), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await _albums.DidNotReceiveWithAnyArgs().GetAlbumByIdAsync(default!);
    }

    [Fact]
    public async Task Get_UnknownOrNotShared_Is404()
    {
        (await GetAlbum.FunctionHandler(Http.As(Owner), _context, "nope")).ShouldHaveStatus(HttpStatusCode.NotFound);
        (await GetAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _tracklist.DidNotReceiveWithAnyArgs().GetAlbumTracksAsync(default!, default!, default, default);
    }

    [Fact]
    public async Task Get_Owner_SeesCountsAndTheFirstTracklistPage()
    {
        _tracklist.GetAlbumTracksAsync(AlbumId, Owner, 10, "c1")
            .Returns(Fakes.Page(Fakes.TrackSummary("t1", Owner)));

        var body = (await GetAlbum.FunctionHandler(Http.As(Owner, new() { ["cursor"] = "c1" }), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("album").GetProperty("shareCount").GetInt32().Should().Be(2);
        body.GetProperty("album").GetProperty("likeCount").GetInt32().Should().Be(4);
        body.GetProperty("tracks").GetProperty("items").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task Get_Recipient_HasOwnerOnlyCountsStripped_AndSeesTheirLike()
    {
        _shares.GetShareAsync(AlbumId, "bob").Returns(new ShareNote { SharedAt = 5 });
        _likes.IsAlbumLikedByUserAsync(AlbumId, "bob").Returns(true);
        _tracklist.GetAlbumTracksAsync(AlbumId, "bob", 10, null).Returns(Fakes.Page<TrackSummary>());

        var album = (await GetAlbum.FunctionHandler(Http.As("bob"), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("album");

        album.TryGetProperty("shareCount", out _).Should().BeFalse();
        album.TryGetProperty("likeCount", out _).Should().BeFalse();
        album.GetProperty("likedByMe").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Get_Recipient_SeesTheirShareWithItsCaption_TheOwnerNone()
    {
        _shares.GetShareAsync(AlbumId, "bob").Returns(new ShareNote { SharedAt = 5, Caption = "for the drive" });
        _tracklist.GetAlbumTracksAsync(AlbumId, Arg.Any<string>(), 10, Arg.Any<string?>()).Returns(Fakes.Page<TrackSummary>());

        var share = (await GetAlbum.FunctionHandler(Http.As("bob"), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("album").GetProperty("myShare");
        share.GetProperty("sharedAt").GetInt64().Should().Be(5);
        share.GetProperty("caption").GetString().Should().Be("for the drive");

        (await GetAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("album")
            .TryGetProperty("myShare", out _).Should().BeFalse();
        await _shares.DidNotReceive().GetShareAsync(AlbumId, Owner);
    }

    [Fact]
    public async Task Get_CarriesTheOwnersSummary()
    {
        _users.GetUserByUsername(Owner).Returns(Fakes.User(Owner));
        _tracklist.GetAlbumTracksAsync(AlbumId, Owner, 10, null).Returns(Fakes.Page<TrackSummary>());

        var owner = (await GetAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("album").GetProperty("owner");

        owner.GetProperty("username").GetString().Should().Be(Owner);
    }

    // ---------------------------------------------------------------- POST /albums

    private CreateAlbumLambda.Function CreateAlbum => new(_albums, _tracks, _validation, _images);

    [Fact]
    public async Task Create_WithSomeoneElsesTrack_Is400_NamingIt()
    {
        _tracks.GetOwnedTrackIdsAsync(Owner, Arg.Any<IReadOnlyList<string>>()).Returns(["mine"]);

        var response = await CreateAlbum.FunctionHandler(Http.As(Owner), _context,
            new CreateAlbumRequest { Name = "EP", TrackIds = ["mine", "theirs"] });

        response.ShouldHaveStatus(HttpStatusCode.BadRequest).ErrorMessage().Should().Contain("theirs");
        await _albums.DidNotReceiveWithAnyArgs()
            .CreateAlbumAsync(default!, default!, default!, default, default, default!);
    }

    [Fact]
    public async Task Create_Is201_WithAServerMintedId_AndTheCoverProcessedToThatId()
    {
        _tracks.GetOwnedTrackIdsAsync(Owner, Arg.Any<IReadOnlyList<string>>()).Returns(["t1"]);
        string? coverKey = null;
        _images.ProcessImageAsync(Arg.Is(Owner), Arg.Is("alice/c.png"), Arg.Do<string>(k => coverKey = k),
                Arg.Is(400), Arg.Is(400))
            .Returns(new ImageProcessingResult("#fff", "https://cdn/c.jpg"));
        _albums.CreateAlbumAsync(Arg.Any<string>(), Arg.Is(Owner), Arg.Is("EP"), Arg.Any<string?>(),
                Arg.Any<ImageProcessingResult?>(), Arg.Any<IReadOnlyList<string>>())
            .Returns(c => Fakes.Album(c.ArgAt<string>(0), Owner));

        (await CreateAlbum.FunctionHandler(Http.As(Owner), _context,
                new CreateAlbumRequest { Name = "EP", ImageKey = "alice/c.png", TrackIds = ["t1"] }))
            .ShouldHaveStatus(HttpStatusCode.Created);

        var albumId = (string)_albums.ReceivedCalls().Single(c => c.GetMethodInfo().Name == "CreateAlbumAsync")
            .GetArguments()[0]!;
        albumId.Should().MatchRegex("^[0-9a-f]{32}$");
        coverKey.Should().Be($"albums/{albumId}/cover_400x400.jpg");
    }

    [Fact]
    public async Task Create_InvalidRequest_Is400()
    {
        _validation.ValidateCreate(Arg.Any<CreateAlbumRequest>()).Throws(new ArgumentException("name is required"));

        (await CreateAlbum.FunctionHandler(Http.As(Owner), _context, new CreateAlbumRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    // ---------------------------------------------------------------- PUT /albums/{albumId}

    private UpdateAlbumLambda.Function UpdateAlbum => new(_albums, _validation, _images);

    [Fact]
    public async Task Update_NonOwner_Is404()
    {
        (await UpdateAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId, new UpdateAlbumRequest { Name = "x" }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _albums.DidNotReceiveWithAnyArgs().UpdateAlbumAsync(default!, default!, default, default, default, default);
    }

    [Fact]
    public async Task Update_PassesTheValidatedFieldsAndCoverChange()
    {
        _albums.UpdateAlbumAsync(Owner, AlbumId, "Renamed", null, null, true).Returns(Fakes.Album(AlbumId, Owner));

        (await UpdateAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId,
                new UpdateAlbumRequest { Name = "Renamed", ClearedImage = true }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _albums.Received(1).UpdateAlbumAsync(Owner, AlbumId, "Renamed", null, null, true);
    }

    // ---------------------------------------------------------------- DELETE /albums/{albumId}

    private DeleteAlbumLambda.Function DeleteAlbum => new(_albums, _images);

    [Fact]
    public async Task Delete_NonOwner_Is404_AndDeletesNothing()
    {
        (await DeleteAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        await _albums.DidNotReceiveWithAnyArgs().DeleteAlbumAsync(default!, default!);
    }

    [Fact]
    public async Task Delete_RemovesTheCoverOnlyWhenThereIsOne()
    {
        (await DeleteAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.OK);
        await _images.DidNotReceiveWithAnyArgs().DeleteImageAsync(default!);

        _albums.GetAlbumByIdAsync(AlbumId).Returns(Fakes.Album(AlbumId, Owner, imageUrl: "https://cdn/c.jpg"));
        (await DeleteAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.OK);
        await _images.Received(1).DeleteImageAsync($"albums/{AlbumId}/cover_400x400.jpg");
        await _albums.Received(2).DeleteAlbumAsync(Owner, AlbumId);
    }

    // ---------------------------------------------------------------- PUT /albums/{albumId}/tracks

    private SetAlbumTracksLambda.Function SetTracks => new(_albums, _tracklist, _validation);

    [Fact]
    public async Task SetTracks_ReportsTheNewCountAndTheDiff()
    {
        _tracklist.SetTracksAsync(AlbumId, Owner, Arg.Any<IReadOnlyList<string>>()).Returns((1, 2));

        var body = (await SetTracks.FunctionHandler(Http.As(Owner), _context, AlbumId,
                new SetAlbumTracksRequest { TrackIds = ["t1", "t2", "t3"] }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        (body.GetProperty("trackCount").GetInt32(), body.GetProperty("added").GetInt32(), body.GetProperty("removed").GetInt32())
            .Should().Be((3, 1, 2));
    }

    [Fact]
    public async Task SetTracks_NotYourTracks_Is400_AndChangesNothing()
    {
        _validation.ValidateSetTracksAsync(Owner, Arg.Any<SetAlbumTracksRequest>())
            .ThrowsAsync(new ArgumentException("albums may only contain your own tracks"));

        (await SetTracks.FunctionHandler(Http.As(Owner), _context, AlbumId, new SetAlbumTracksRequest { TrackIds = ["x"] }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _tracklist.DidNotReceiveWithAnyArgs().SetTracksAsync(default!, default!, default!);
    }

    [Fact]
    public async Task SetTracks_NonOwner_Is404_BeforeValidating()
    {
        (await SetTracks.FunctionHandler(Http.As(Stranger), _context, AlbumId, new SetAlbumTracksRequest()))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _validation.DidNotReceiveWithAnyArgs().ValidateSetTracksAsync(default!, default!);
    }

    // ---------------------------------------------------------------- POST /albums/{albumId}/share

    private ShareAlbumLambda.Function ShareAlbum => new(_albums, _shares, _users, _validation);

    [Fact]
    public async Task Share_NonOwner_Is404()
    {
        (await ShareAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId, new ShareAlbumRequest { Add = ["bob"] }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _shares.DidNotReceiveWithAnyArgs().ShareAlbumAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Share_RemoveWins_AndOnlyCurrentRecipientsAreRemoved()
    {
        _shares.GetAlbumRecipientsAsync(AlbumId).Returns(["carol"]);
        _users.GetValidatedRecipientsAsync(Arg.Any<List<string>>(), Owner).Returns(["bob"]);

        var body = (await ShareAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId,
                new ShareAlbumRequest { Add = ["bob"], Remove = ["bob", "Carol", "nobody"], Caption = "hi" }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("sharedWith").GetArrayLength().Should().Be(0);
        await _shares.Received(1).ShareAlbumAsync(AlbumId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.Count == 0),
            Arg.Is<IReadOnlyList<string>>(r => r.SequenceEqual(new[] { "carol" })), "hi"); // typed casing → the stored key
    }

    [Fact]
    public async Task Share_PastFiftyRecipientsInTotal_IsAllowed()
    {
        // The 50 cap is per request (validator); an album has no total recipient cap.
        _shares.GetAlbumRecipientsAsync(AlbumId).Returns(Enumerable.Range(0, 50).Select(i => $"u{i}").ToList());
        _users.GetValidatedRecipientsAsync(Arg.Any<List<string>>(), Owner).Returns(["newcomer"]);

        (await ShareAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId, new ShareAlbumRequest { Add = ["newcomer"] }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json()
            .GetProperty("sharedWith").GetArrayLength().Should().Be(51);
        await _shares.Received(1).ShareAlbumAsync(AlbumId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.SequenceEqual(new[] { "newcomer" })),
            Arg.Is<IReadOnlyList<string>>(r => r.Count == 0), null);
    }

    // ---------------------------------------------------------------- likes + listings

    private LikeAlbumLambda.Function LikeAlbum => new(_albums, _shares, _likes);

    [Fact]
    public async Task Like_RequiresAccess_UnlikeDoesNot()
    {
        (await LikeAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId,
                new LikeAlbumLambda.LikeAlbumRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _likes.DidNotReceiveWithAnyArgs().LikeAlbumAsync(default!, default!, default!);

        (await LikeAlbum.FunctionHandler(Http.As(Stranger), _context, AlbumId,
                new LikeAlbumLambda.LikeAlbumRequest { NewValue = false }))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _likes.Received(1).UnlikeAlbumAsync(AlbumId, Stranger, Owner);
    }

    [Fact]
    public async Task Like_ByARecipient_LikesWithTheOwner()
    {
        _shares.IsAlbumSharedWithUserAsync(AlbumId, "bob").Returns(true);

        (await LikeAlbum.FunctionHandler(Http.As("bob"), _context, AlbumId,
                new LikeAlbumLambda.LikeAlbumRequest { NewValue = true }))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("newValue").GetBoolean().Should().BeTrue();
        await _likes.Received(1).LikeAlbumAsync(AlbumId, "bob", Owner);
    }

    [Fact]
    public async Task Like_MissingNewValue_Is400()
    {
        (await LikeAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId, new LikeAlbumLambda.LikeAlbumRequest()))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task LikersAndRecipients_AreOwnerOnly()
    {
        var likers = new GetAlbumLikesLambda.Function(_albums, _likes);
        var recipients = new GetAlbumRecipientsLambda.Function(_albums, _shares);

        (await likers.FunctionHandler(Http.As(Stranger), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.NotFound);
        (await recipients.FunctionHandler(Http.As(Stranger), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.NotFound);

        _likes.GetAlbumLikersAsync(AlbumId, 10, null).Returns(Fakes.Page<AlbumLiker>());
        _shares.GetAlbumRecipientDetailsAsync(AlbumId).Returns([]);
        (await likers.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.OK);
        (await recipients.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Listings_AreTheCallersOwn_WithLimitAndCursor()
    {
        var query = new Dictionary<string, string> { ["limit"] = "20", ["cursor"] = "c1" };
        _albums.GetAlbumsAsync(Owner, 20, "c1").Returns(Fakes.Page<AlbumSummary>());
        _shares.GetAlbumsSharedWithUserAsync(Owner, 20, "c1").Returns(Fakes.Page<SharedAlbum>());
        _likes.GetLikedAlbumsAsync(Owner, 20, "c1").Returns(Fakes.Page<AlbumSummary>());

        (await new GetAlbumsLambda.Function(_albums).FunctionHandler(Http.As(Owner, query), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        (await new GetAlbumsSharedWithMeLambda.Function(_shares).FunctionHandler(Http.As(Owner, query), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        (await new GetLikedAlbumsLambda.Function(_likes, _shares).FunctionHandler(Http.As(Owner, query), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);

        await _albums.Received(1).GetAlbumsAsync(Owner, 20, "c1");
        await _shares.Received(1).GetAlbumsSharedWithUserAsync(Owner, 20, "c1");
        await _likes.Received(1).GetLikedAlbumsAsync(Owner, 20, "c1");
    }

    // A like outlives losing access (and is still there after a re-share), but while the album
    // isn't yours or shared with you it's left out of your Liked albums
    [Fact]
    public async Task LikedAlbums_LeaveOutAlbumsNoLongerSharedWithYou_KeepingTheCursor()
    {
        AlbumSummary Liked(string id, string owner) => new()
        {
            Id = id, Name = id, TrackCount = 1, TotalDurationSeconds = 60, CreatedAt = 1, LikedByMe = true,
            Owner = Fakes.Summary(owner),
        };
        _likes.GetLikedAlbumsAsync("bob", 10, null).Returns(new PaginatedResult<AlbumSummary>
        {
            Items = [Liked("own", "bob"), Liked("still-shared", Owner), Liked("unshared", Owner)],
            NextCursor = "next",
        });
        _shares.IsAlbumSharedWithUserAsync("still-shared", "bob").Returns(true);
        _shares.IsAlbumSharedWithUserAsync("unshared", "bob").Returns(false);

        var body = (await new GetLikedAlbumsLambda.Function(_likes, _shares).FunctionHandler(Http.As("bob"), _context))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("items").EnumerateArray().Select(a => a.GetProperty("id").GetString())
            .Should().Equal("own", "still-shared");
        body.GetProperty("nextCursor").GetString().Should().Be("next");
        await _shares.DidNotReceive().IsAlbumSharedWithUserAsync("own", Arg.Any<string>()); // your own needs no check
    }

    [Fact]
    public async Task SharedFromUser_IsTheSendersAlbumsSharedWithTheCaller()
    {
        var handler = new GetAlbumsSharedFromUserLambda.Function(_shares);
        var query = new Dictionary<string, string> { ["limit"] = "20", ["cursor"] = "c1" };
        _shares.GetAlbumsSharedFromUserAsync(Owner, "bob", 20, "c1").Returns(Fakes.Page<SharedAlbum>());

        (await handler.FunctionHandler(Http.Anonymous(), _context, Owner)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        // the sender in the path is normalised to lowercase; the viewer is always the caller
        (await handler.FunctionHandler(Http.As("bob", query), _context, Owner.ToUpperInvariant()))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.Received(1).GetAlbumsSharedFromUserAsync(Owner, "bob", 20, "c1");
    }

    [Fact]
    public async Task RemoveFromLibrary_ActsOnTheCaller()
    {
        (await new RemoveSharedAlbumLambda.Function(_shares).FunctionHandler(Http.As("bob"), _context, AlbumId))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _shares.Received(1).RemoveAlbumFromLibraryAsync(AlbumId, "bob");
    }

    [Fact]
    public async Task AnyRepositoryFailure_Is500()
    {
        _albums.GetAlbumByIdAsync(AlbumId).ThrowsAsync(new InvalidOperationException("boom"));

        (await GetAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.InternalServerError);
        (await DeleteAlbum.FunctionHandler(Http.As(Owner), _context, AlbumId)).ShouldHaveStatus(HttpStatusCode.InternalServerError);
    }
}
