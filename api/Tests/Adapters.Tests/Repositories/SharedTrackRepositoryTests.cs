using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class SharedTrackRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<(Seed Seed, SharedTrackRepository Shares, string Owner, string Recipient, string TrackId)>
        ArrangeUnsharedAsync()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        return (seed, new SharedTrackRepository(db), owner, recipient, trackId);
    }

    private Task<List<FeedItemDataModel>> FeedAsync(string username) =>
        fixture.Db.QueryAsync<FeedItemDataModel>($"FEED#{username}", FeedItemType.Track, QueryOperator.BeginsWith);

    [Fact]
    public async Task Share_GrantsAccess_CountsTheRecipient_AndListsItWithTheCaption()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();

        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "you'll like this");

        (await shares.IsTrackAccessibleToUser(trackId, recipient)).Should().BeTrue();
        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(1);
        var shared = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Should().ContainSingle().Subject;
        (shared.Track.Id, shared.Caption).Should().Be((trackId, "you'll like this"));
        (await shares.GetTrackRecipientsAsync(trackId)).Should().Equal(recipient);
        (await FeedAsync(recipient)).Should().ContainSingle();
    }

    [Fact]
    public async Task DirectShare_IsTheRecipientsOwn_WithItsCaption_AndNullForAnyoneElse()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        var stranger = await seed.UserAsync();

        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "play it loud");

        var share = await shares.GetDirectShareAsync(trackId, recipient);
        share!.Caption.Should().Be("play it loud");
        share.SharedAt.Should().BePositive();
        (await shares.GetDirectShareAsync(trackId, stranger)).Should().BeNull();
        (await shares.GetDirectShareAsync(trackId, owner)).Should().BeNull();
    }

    [Fact]
    public async Task Library_IsOwnPlusDirectPlusAlbumTracks_DedupedAndNothingElse()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var me = await seed.UserAsync();
        var friend = await seed.UserAsync();
        var mine = await seed.TrackAsync(me);
        var direct = await seed.TrackAsync(friend, 180, me);
        var inAlbum = await seed.TrackAsync(friend);
        var both = await seed.TrackAsync(friend, 180, me); // direct AND in the album
        var notShared = await seed.TrackAsync(friend);
        var albumId = await seed.AlbumAsync(friend, inAlbum, both);
        await seed.AlbumShares.ShareAlbumAsync(albumId, friend, [me], [], null);

        var library = await shares.GetLibraryTracksAsync(me);

        library.Select(t => t.Id).Should().BeEquivalentTo([mine, direct, inAlbum, both]);
        library.Should().OnlyHaveUniqueItems(t => t.Id);
        library.Should().NotContain(t => t.Id == notShared);
        library.Single(t => t.Id == inAlbum).Owner.Username.Should().Be(friend);
    }

    [Fact]
    public async Task ReShare_OverwritesCaptionAndResurfaces_WithoutCountingTwice()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "first");
        var firstSharedAt = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Single().SharedAt;

        await Task.Delay(5);
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "second");

        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(1);
        var shared = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Should().ContainSingle().Subject;
        shared.Caption.Should().Be("second");
        shared.SharedAt.Should().BeGreaterThan(firstSharedAt);
        (await FeedAsync(recipient)).Should().ContainSingle();
    }

    [Fact]
    public async Task Unshare_RevokesAccess_RemovesTheFeedItem_AndDecrements()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], null);

        await shares.ShareTrackAsync(trackId, owner, [], [recipient], null);

        (await shares.IsTrackAccessibleToUser(trackId, recipient)).Should().BeFalse();
        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(0);
        (await FeedAsync(recipient)).Should().BeEmpty();
    }

    [Fact]
    public async Task AddAndRemoveTheSameRecipient_RemoveWins()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], null);

        await shares.ShareTrackAsync(trackId, owner, [recipient], [recipient], null);

        (await shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeFalse();
        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(0);
    }

    [Fact]
    public async Task AccessRule_IsDirectShareOrAlbumGrant_NotEveryone()
    {
        var db = fixture.Db;
        var (seed, shares, owner, direct, trackId) = await ArrangeUnsharedAsync();
        var viaAlbum = await seed.UserAsync();
        var stranger = await seed.UserAsync();
        await shares.ShareTrackAsync(trackId, owner, [direct], [], null);
        var albumId = await seed.AlbumAsync(owner, trackId);
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [viaAlbum], [], null);

        (await shares.IsTrackAccessibleToUser(trackId, direct)).Should().BeTrue();
        (await shares.IsTrackAccessibleToUser(trackId, viaAlbum)).Should().BeTrue();
        (await shares.IsTrackSharedWithUser(trackId, viaAlbum)).Should().BeFalse(); // album access isn't a direct share
        (await shares.IsTrackAccessibleToUser(trackId, stranger)).Should().BeFalse();
    }

    [Fact]
    public async Task ConcurrentDoubleRemoveFromLibrary_DecrementsShareCountOnce()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var bystander = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 100, recipient, bystander);
        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(2);

        await Task.WhenAll(
            shares.RemoveTrackFromLibraryAsync(trackId, recipient),
            shares.RemoveTrackFromLibraryAsync(trackId, recipient));

        (await shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeFalse();
        (await shares.IsTrackSharedWithUser(trackId, bystander)).Should().BeTrue();
        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(1);
        (await FeedAsync(recipient)).Should().BeEmpty();
    }

    [Fact]
    public async Task RemoveFromLibrary_WithoutAShare_IsANoOp()
    {
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        var other = await seed.UserAsync();
        await shares.ShareTrackAsync(trackId, owner, [other], [], null);

        await shares.RemoveTrackFromLibraryAsync(trackId, recipient);

        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(1);
    }

    [Fact]
    public async Task RemoveFromLibrary_KeepsAccessThroughASharedAlbum()
    {
        var db = fixture.Db;
        var (seed, shares, owner, recipient, trackId) = await ArrangeUnsharedAsync();
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], null);
        var albumId = await seed.AlbumAsync(owner, trackId);
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        await shares.RemoveTrackFromLibraryAsync(trackId, recipient);

        (await shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeFalse();
        (await shares.IsTrackAccessibleToUser(trackId, recipient)).Should().BeTrue();
    }

    [Fact]
    public async Task SharedWithMe_IsNewestFirst()
    {
        var (seed, shares, owner, recipient, older) = await ArrangeUnsharedAsync();
        var newer = await seed.TrackAsync(owner);
        await shares.ShareTrackAsync(older, owner, [recipient], [], null);
        await Task.Delay(5);
        await shares.ShareTrackAsync(newer, owner, [recipient], [], null);

        var ids = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Select(s => s.Track.Id);
        ids.Should().Equal(newer, older);
    }
}
