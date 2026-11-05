using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using Ports.Repositories;
using Ports.Services;

namespace Lambda.Tests.Handlers;

public class LinkHandlerTests
{
    private const string Owner = "alice";
    private const string Viewer = "bob";
    private const string Token = "AbCdEfGhIjKlMnOpQrStUv";
    private const string TrackId = "t1";
    private const string AlbumId = "a1";

    private readonly IShareLinkRepository _links = Substitute.For<IShareLinkRepository>();
    private readonly ILinkTargetService _targets = Substitute.For<ILinkTargetService>();
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IAudioService _audio = Substitute.For<IAudioService>();
    private readonly ISharedTrackRepository _trackShares = Substitute.For<ISharedTrackRepository>();
    private readonly IAlbumShareRepository _albumShares = Substitute.For<IAlbumShareRepository>();
    private readonly TestLambdaContext _context = new();

    private static readonly LinkItem Track = new()
    {
        Kind = ShareLinkKind.Track, Id = TrackId, Owner = Owner, Name = "Night Drive", Slug = "night-drive",
        Duration = 242, Genre = "Electronic",
        Tracks = [new LinkItemTrack(TrackId, "Night Drive", 242)],
    };

    private static readonly LinkItem Album = new()
    {
        Kind = ShareLinkKind.Album, Id = AlbumId, Owner = Owner, Name = "Demos", Duration = 200,
        Tracks = [new LinkItemTrack("t1", "Intro", 20), new LinkItemTrack("t2", "Long one", 180)],
    };

    public LinkHandlerTests()
    {
        _targets.GetAsync(ShareLinkKind.Track, TrackId).Returns(Track);
        _targets.GetAsync(ShareLinkKind.Album, AlbumId).Returns(Album);
        _users.GetUserByUsername(Owner).Returns(Fakes.User(Owner));
        _audio.GetPreviewAsync(Arg.Any<LinkItemTrack>(), Arg.Any<TimeSpan>()).Returns(c => new LinkPreviewAudio
        {
            Url = $"https://s3/{c.Arg<LinkItemTrack>().Id}",
            IsFullTrack = c.Arg<LinkItemTrack>().Duration <= 30,
        });
        _links.TryClaimAsync(Token).Returns(true);
    }

    private static ShareLinkDataModel Link(string kind = ShareLinkKind.Track, string targetId = TrackId,
        bool expired = false, bool revoked = false, bool allowPreview = true, string? caption = null)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return new ShareLinkDataModel
        {
            Pk = $"LINK#{Token}", Sk = "META", Gsi3Pk = ShareLinks.ListPk(kind, targetId), Gsi3Sk = "DATE#1",
            Token = Token, Owner = Owner, Kind = kind, TargetId = targetId, CreatedAt = now - 1000,
            LinkExpiresAt = expired ? now - 1 : now + 86_400_000, ExpiresAt = 0, AllowPreview = allowPreview,
            AcceptedCount = 3, RevokedAt = revoked ? now - 10 : null, Caption = caption,
        };
    }

    private void LinkIs(ShareLinkDataModel? link) => _links.GetAsync(Token).Returns(link);

    // ---------------------------------------------------------------- POST /links

    private CreateLinkLambda.Function CreateLink => new(_links, _targets);

    [Fact]
    public async Task Create_OwnTrack_Is201_DefaultsTo7DaysWithPreview()
    {
        _links.CreateAsync(Owner, ShareLinkKind.Track, TrackId, TimeSpan.FromDays(7), true).Returns(Link());

        var body = (await CreateLink.FunctionHandler(Http.As(Owner), _context,
                new CreateShareLinkRequest { Kind = "track", TargetId = TrackId }))
            .ShouldHaveStatus(HttpStatusCode.Created).Json();

        body.GetProperty("token").GetString().Should().Be(Token);
        body.GetProperty("state").GetString().Should().Be(ShareLinkState.Active);
        await _links.Received(1).CreateAsync(Owner, ShareLinkKind.Track, TrackId, TimeSpan.FromDays(7), true);
    }

    [Fact]
    public async Task Create_SomeoneElsesOrMissingItem_Is404()
    {
        (await CreateLink.FunctionHandler(Http.As(Viewer), _context,
                new CreateShareLinkRequest { Kind = "TRACK", TargetId = TrackId }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        (await CreateLink.FunctionHandler(Http.As(Owner), _context,
                new CreateShareLinkRequest { Kind = "ALBUM", TargetId = "nope" }))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _links.DidNotReceiveWithAnyArgs().CreateAsync(default!, default!, default!, default, default);
    }

    [Fact]
    public async Task Create_WithCaption_SanitisesItAndCapsIt()
    {
        _links.CreateAsync(default!, default!, default!, default, default, default).ReturnsForAnyArgs(Link(caption: "hi there"));

        (await CreateLink.FunctionHandler(Http.As(Owner), _context,
                new CreateShareLinkRequest { Kind = "TRACK", TargetId = TrackId, Caption = "  hi   there  " }))
            .ShouldHaveStatus(HttpStatusCode.Created).Json().GetProperty("caption").GetString().Should().Be("hi there");
        await _links.Received(1).CreateAsync(Owner, ShareLinkKind.Track, TrackId, TimeSpan.FromDays(7), true, "hi there");

        (await CreateLink.FunctionHandler(Http.As(Owner), _context,
                new CreateShareLinkRequest { Kind = "TRACK", TargetId = TrackId, Caption = new string('c', 301) }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("PLAYLIST", TrackId, "7d")]
    [InlineData("TRACK", null, "7d")]
    [InlineData("TRACK", TrackId, "1y")]
    public async Task Create_BadKindTargetOrExpiry_Is400(string kind, string? targetId, string expiresIn)
    {
        (await CreateLink.FunctionHandler(Http.As(Owner), _context,
                new CreateShareLinkRequest { Kind = kind, TargetId = targetId, ExpiresIn = expiresIn }))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_WithoutIdentity_Is401()
    {
        (await CreateLink.FunctionHandler(Http.Anonymous(), _context,
                new CreateShareLinkRequest { Kind = "TRACK", TargetId = TrackId }))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    // ---------------------------------------------------------------- GET /links

    private GetLinksLambda.Function GetLinks => new(_links, _targets);

    [Fact]
    public async Task List_Owner_SeesEachLinkWithItsState()
    {
        _links.ListForTargetAsync(ShareLinkKind.Track, TrackId).Returns([Link(), Link(expired: true), Link(revoked: true)]);

        var items = (await GetLinks.FunctionHandler(
                Http.As(Owner, new() { ["kind"] = "TRACK", ["targetId"] = TrackId }), _context))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("items");

        items.EnumerateArray().Select(i => i.GetProperty("state").GetString())
            .Should().Equal(ShareLinkState.Active, ShareLinkState.Expired, ShareLinkState.Revoked);
    }

    [Fact]
    public async Task List_NotTheOwner_Is404()
    {
        (await GetLinks.FunctionHandler(
                Http.As(Viewer, new() { ["kind"] = "TRACK", ["targetId"] = TrackId }), _context))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _links.DidNotReceiveWithAnyArgs().ListForTargetAsync(default!, default!);
    }

    // ---------------------------------------------------------------- DELETE /links/{token}, restore

    [Fact]
    public async Task Revoke_Owner_RevokesAndReturnsTheLink()
    {
        _links.GetAsync(Token).Returns(Link(), Link(revoked: true));

        (await new RevokeLinkLambda.Function(_links).FunctionHandler(Http.As(Owner), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("state").GetString()
            .Should().Be(ShareLinkState.Revoked);
        await _links.Received(1).RevokeAsync(Token);
    }

    [Fact]
    public async Task RevokeAndRestore_NotTheOwnerOrUnknown_Is404()
    {
        LinkIs(Link());
        (await new RevokeLinkLambda.Function(_links).FunctionHandler(Http.As(Viewer), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        (await new RestoreLinkLambda.Function(_links).FunctionHandler(Http.As(Viewer), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        (await new RevokeLinkLambda.Function(_links).FunctionHandler(Http.As(Owner), _context, "nope"))
            .ShouldHaveStatus(HttpStatusCode.NotFound);
        await _links.DidNotReceiveWithAnyArgs().RevokeAsync(default!);
        await _links.DidNotReceiveWithAnyArgs().RestoreAsync(default!);
    }

    [Fact]
    public async Task Restore_Owner_Restores()
    {
        _links.GetAsync(Token).Returns(Link(revoked: true), Link());

        (await new RestoreLinkLambda.Function(_links).FunctionHandler(Http.As(Owner), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("state").GetString()
            .Should().Be(ShareLinkState.Active);
        await _links.Received(1).RestoreAsync(Token);
    }

    // ---------------------------------------------------------------- GET /links/{token} (public)

    private GetLinkPreviewLambda.Function Preview => new(_links, _targets, _users, _audio);

    [Fact]
    public async Task Preview_ValidTrack_ShowsSenderItemAndClip_WithNoIdentity()
    {
        LinkIs(Link());

        var body = (await Preview.FunctionHandler(Http.Anonymous(), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("state").GetString().Should().Be(LinkPreviewState.Valid);
        body.GetProperty("sender").GetProperty("username").GetString().Should().Be(Owner);
        body.GetProperty("name").GetString().Should().Be("Night Drive");
        var track = body.GetProperty("tracks")[0];
        track.GetProperty("preview").GetProperty("url").GetString().Should().Be("https://s3/t1");
        track.GetProperty("preview").GetProperty("isFullTrack").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Preview_CarriesTheCaption_ButNotWhenExpired()
    {
        LinkIs(Link(caption: "for the drive home"));
        (await Preview.FunctionHandler(Http.Anonymous(), _context, Token)).Json()
            .GetProperty("caption").GetString().Should().Be("for the drive home");

        LinkIs(Link(expired: true, caption: "for the drive home"));
        (await Preview.FunctionHandler(Http.Anonymous(), _context, Token)).Json()
            .TryGetProperty("caption", out _).Should().BeFalse();
    }

    [Fact]
    public async Task Preview_Album_ListsEveryTrack_ShortOnesInFull()
    {
        LinkIs(Link(ShareLinkKind.Album, AlbumId));

        var tracks = (await Preview.FunctionHandler(Http.Anonymous(), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("tracks");

        tracks.GetArrayLength().Should().Be(2);
        tracks[0].GetProperty("preview").GetProperty("isFullTrack").GetBoolean().Should().BeTrue();
        tracks[1].GetProperty("preview").GetProperty("isFullTrack").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Preview_PreviewOff_HandsOutNoAudio()
    {
        LinkIs(Link(allowPreview: false));

        var body = (await Preview.FunctionHandler(Http.Anonymous(), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("allowPreview").GetBoolean().Should().BeFalse();
        body.GetProperty("tracks")[0].GetProperty("preview").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Null);
        await _audio.DidNotReceiveWithAnyArgs().GetPreviewAsync(default!, default);
    }

    [Fact]
    public async Task Preview_Expired_ShowsOnlyTheSender()
    {
        LinkIs(Link(expired: true));

        var body = (await Preview.FunctionHandler(Http.Anonymous(), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("state").GetString().Should().Be(LinkPreviewState.Expired);
        body.GetProperty("sender").GetProperty("username").GetString().Should().Be(Owner);
        body.TryGetProperty("name", out _).Should().BeFalse();
        body.TryGetProperty("tracks", out _).Should().BeFalse();
        await _audio.DidNotReceiveWithAnyArgs().GetPreviewAsync(default!, default);
    }

    [Fact]
    public async Task Preview_RevokedUnknownOrDeleted_AreIdentical_AndNameNobody()
    {
        var bodies = new List<string>();

        LinkIs(Link(revoked: true));
        bodies.Add((await Preview.FunctionHandler(Http.Anonymous(), _context, Token)).Body);
        LinkIs(null);
        bodies.Add((await Preview.FunctionHandler(Http.Anonymous(), _context, Token)).Body);
        LinkIs(Link(targetId: "deleted"));
        bodies.Add((await Preview.FunctionHandler(Http.Anonymous(), _context, Token)).Body);

        bodies.Should().AllBe("{\"state\":\"UNAVAILABLE\"}");
    }

    // ---------------------------------------------------------------- GET /links/{token}/viewer

    private GetLinkViewerLambda.Function ViewerFn => new(_links, _targets);

    [Fact]
    public async Task Viewer_Owner_IsOwn_WithTheLinksStats()
    {
        LinkIs(Link());

        var body = (await ViewerFn.FunctionHandler(Http.As(Owner), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("relation").GetString().Should().Be(LinkViewerRelation.Own);
        body.GetProperty("link").GetProperty("acceptedCount").GetInt32().Should().Be(3);
        body.GetProperty("target").GetProperty("slug").GetString().Should().Be("night-drive");
    }

    [Fact]
    public async Task Viewer_SomeoneWithAccess_IsAlreadyHave_WithoutStats()
    {
        LinkIs(Link());
        _targets.HasAccessAsync(Track, Viewer).Returns(true);

        var body = (await ViewerFn.FunctionHandler(Http.As(Viewer), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("relation").GetString().Should().Be(LinkViewerRelation.AlreadyHave);
        body.TryGetProperty("link", out _).Should().BeFalse();
    }

    [Fact]
    public async Task Viewer_Revoked_Is404()
    {
        LinkIs(Link(revoked: true));
        (await ViewerFn.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.NotFound);
    }

    // ---------------------------------------------------------------- POST /links/{token}/accept

    private AcceptLinkLambda.Function Accept => new(_links, _targets, _trackShares, _albumShares);

    [Fact]
    public async Task Accept_Track_ClaimsThenSharesWithTheCaller_WithoutActivity()
    {
        LinkIs(Link());

        var body = (await Accept.FunctionHandler(Http.As(Viewer), _context, Token))
            .ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("id").GetString().Should().Be(TrackId);
        body.GetProperty("owner").GetString().Should().Be(Owner);
        Received.InOrder(() =>
        {
            _links.TryClaimAsync(Token);
            _trackShares.ShareTrackAsync(TrackId, Owner,
                Arg.Is<IReadOnlyList<string>>(a => a.SequenceEqual(new[] { Viewer })),
                Arg.Is<IReadOnlyList<string>>(r => r.Count == 0), null, false);
        });
    }

    [Fact]
    public async Task Accept_TheLinksCaptionBecomesTheSharesCaption()
    {
        LinkIs(Link(caption: "for the drive home"));

        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.OK);

        await _trackShares.Received(1).ShareTrackAsync(TrackId, Owner, Arg.Any<IReadOnlyList<string>>(),
            Arg.Any<IReadOnlyList<string>>(), "for the drive home", false);
    }

    [Fact]
    public async Task Accept_Album_SharesTheAlbum()
    {
        LinkIs(Link(ShareLinkKind.Album, AlbumId));

        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.OK);

        await _albumShares.Received(1).ShareAlbumAsync(AlbumId, Owner,
            Arg.Is<IReadOnlyList<string>>(a => a.SequenceEqual(new[] { Viewer })),
            Arg.Is<IReadOnlyList<string>>(r => r.Count == 0), null, false);
    }

    [Fact]
    public async Task Accept_AlreadyHaveIt_WritesNothing()
    {
        LinkIs(Link());
        _targets.HasAccessAsync(Track, Viewer).Returns(true);

        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.OK);

        await _links.DidNotReceiveWithAnyArgs().TryClaimAsync(default!);
        await _trackShares.DidNotReceiveWithAnyArgs().ShareTrackAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Accept_OwnLink_Is400()
    {
        LinkIs(Link());
        (await Accept.FunctionHandler(Http.As(Owner), _context, Token)).ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Accept_Expired_Is410_RevokedOrUnknown_Is404()
    {
        LinkIs(Link(expired: true));
        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.Gone);
        LinkIs(Link(revoked: true));
        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.NotFound);
        LinkIs(null);
        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.NotFound);

        await _trackShares.DidNotReceiveWithAnyArgs().ShareTrackAsync(default!, default!, default!, default!, default);
    }

    [Fact]
    public async Task Accept_RevokedBetweenReadAndClaim_SharesNothing()
    {
        _links.GetAsync(Token).Returns(Link(), Link(revoked: true));
        _links.TryClaimAsync(Token).Returns(false);

        (await Accept.FunctionHandler(Http.As(Viewer), _context, Token)).ShouldHaveStatus(HttpStatusCode.NotFound);

        await _trackShares.DidNotReceiveWithAnyArgs().ShareTrackAsync(default!, default!, default!, default!, default);
    }
}
