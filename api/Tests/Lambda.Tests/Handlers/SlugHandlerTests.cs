using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using Ports.Repositories;

namespace Lambda.Tests.Handlers;

// GET /users/{username}/slugs/{kind}/{slug} — readable URL → id, with one 404 for every miss
public class SlugHandlerTests
{
    private const string Owner = "alice";
    private const string Friend = "bob";
    private const string Stranger = "eve";

    private readonly ISlugRepository _slugs = Substitute.For<ISlugRepository>();
    private readonly ITrackRepository _tracks = Substitute.For<ITrackRepository>();
    private readonly ISharedTrackRepository _shares = Substitute.For<ISharedTrackRepository>();
    private readonly IAlbumRepository _albums = Substitute.For<IAlbumRepository>();
    private readonly IAlbumShareRepository _albumShares = Substitute.For<IAlbumShareRepository>();
    private readonly IPlaylistRepository _playlists = Substitute.For<IPlaylistRepository>();
    private readonly TestLambdaContext _context = new();

    public SlugHandlerTests()
    {
        // t1 is at "new-name"; "old-name" is its previous URL
        _slugs.GetTargetIdAsync(Owner, SlugKind.Track, "new-name").Returns("t1");
        _slugs.GetTargetIdAsync(Owner, SlugKind.Track, "old-name").Returns("t1");
        var track = Fakes.Track("t1", Owner);
        track.Slug = "new-name";
        _tracks.GetTrackAsync("t1").Returns(track);
        _shares.IsTrackAccessibleToUser("t1", Friend).Returns(true);

        _slugs.GetTargetIdAsync(Owner, SlugKind.Album, "summer").Returns("a1");
        var album = Fakes.Album("a1", Owner);
        album.Slug = "summer";
        _albums.GetAlbumByIdAsync("a1").Returns(album);
        _albumShares.IsAlbumSharedWithUserAsync("a1", Friend).Returns(true);

        _slugs.GetTargetIdAsync(Owner, SlugKind.Playlist, "road-trip").Returns("p1");
        var playlist = Fakes.Playlist("p1");
        playlist.Slug = "road-trip";
        _playlists.GetPlaylistAsync(Owner, "p1").Returns(playlist);
    }

    private ResolveSlugLambda.Function Resolve => new(_slugs, _tracks, _shares, _albums, _albumShares, _playlists);

    private Task<Amazon.Lambda.APIGatewayEvents.APIGatewayHttpApiV2ProxyResponse> As(string caller, string kind,
        string slug, string owner = Owner) =>
        Resolve.FunctionHandler(Http.As(caller), _context, owner, kind, slug);

    [Theory]
    [InlineData(Owner, "tracks", "new-name", "t1", "new-name")]
    [InlineData(Friend, "tracks", "new-name", "t1", "new-name")]
    [InlineData(Owner, "albums", "summer", "a1", "summer")]
    [InlineData(Friend, "albums", "summer", "a1", "summer")]
    [InlineData(Owner, "playlists", "road-trip", "p1", "road-trip")]
    public async Task AnyoneWithAccess_GetsTheIdAndCanonicalSlug(string caller, string kind, string slug,
        string id, string canonical)
    {
        var body = (await As(caller, kind, slug)).ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("id").GetString().Should().Be(id);
        body.GetProperty("slug").GetString().Should().Be(canonical);
    }

    [Fact]
    public async Task AnOldSlug_ResolvesToTheCurrentOne()
    {
        var body = (await As(Friend, "tracks", "old-name")).ShouldHaveStatus(HttpStatusCode.OK).Json();

        body.GetProperty("slug").GetString().Should().Be("new-name");
    }

    [Fact]
    public async Task OwnerInThePath_IsCaseInsensitive()
    {
        (await As(Friend, "tracks", "new-name", owner: "ALICE")).ShouldHaveStatus(HttpStatusCode.OK);
    }

    // Missing, no access, someone else's playlist, an old slug you can't see, an unknown kind:
    // every one is the same 404 with the same message, so a guess reveals nothing
    [Theory]
    [InlineData(Owner, "tracks", "nothing-here")]
    [InlineData(Stranger, "tracks", "new-name")]
    [InlineData(Stranger, "tracks", "old-name")]
    [InlineData(Stranger, "albums", "summer")]
    [InlineData(Friend, "playlists", "road-trip")]
    [InlineData(Owner, "widgets", "new-name")]
    public async Task EveryMiss_IsTheSame404(string caller, string kind, string slug)
    {
        var response = (await As(caller, kind, slug)).ShouldHaveStatus(HttpStatusCode.NotFound);

        response.ErrorMessage().Should().Be("This isn't available");
        response.Body.Should().NotContain("new-name").And.NotContain("t1");
    }

    [Fact]
    public async Task SomeoneElsesPlaylist_NeverReachesTheTable()
    {
        await As(Friend, "playlists", "road-trip");

        await _slugs.DidNotReceiveWithAnyArgs().GetTargetIdAsync(default!, default!, default!);
    }

    [Fact]
    public async Task NoIdentity_Is401()
    {
        (await Resolve.FunctionHandler(Http.Anonymous(), _context, Owner, "tracks", "new-name"))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }
}
