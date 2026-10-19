using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class AlbumShareRepositoryTests(DynamoDbLocalFixture fixture)
{
    private Task<List<FeedItemDataModel>> FeedAsync(string username) =>
        fixture.Db.QueryAsync<FeedItemDataModel>($"FEED#{username}", FeedItemType.Album, QueryOperator.BeginsWith);

    [Fact]
    public async Task Share_GrantsEveryTrack_CountsTheRecipient_AndFeedsThem()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var t1 = await seed.TrackAsync(owner);
        var t2 = await seed.TrackAsync(owner);
        var albumId = await seed.AlbumAsync(owner, t1, t2);

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], "for you");

        (await shares.IsTrackSharedWithUserViaAlbum(t1, recipient)).Should().BeTrue();
        (await shares.IsTrackSharedWithUserViaAlbum(t2, recipient)).Should().BeTrue();
        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(1);
        var shared = (await seed.AlbumShares.GetAlbumsSharedWithUserAsync(recipient, 10, null)).Items.Should().ContainSingle().Subject;
        (shared.Album.Id, shared.Caption).Should().Be((albumId, "for you"));
        (await FeedAsync(recipient)).Should().ContainSingle();
    }

    [Fact]
    public async Task ReShare_OverwritesCaption_WithoutCountingTheRecipientTwice()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], "first");
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(1);
        var shared = (await seed.AlbumShares.GetAlbumsSharedWithUserAsync(recipient, 10, null)).Items.Should().ContainSingle().Subject;
        shared.Caption.Should().BeNull(); // a re-share without a caption clears it
        (await FeedAsync(recipient)).Should().ContainSingle(); // resurfaced, not duplicated
    }

    [Fact]
    public async Task AddAndRemoveTheSameRecipient_RemoveWins()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [recipient], null);

        (await seed.AlbumShares.IsAlbumSharedWithUserAsync(albumId, recipient)).Should().BeFalse();
        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(0);
    }

    [Fact]
    public async Task UnshareWithDifferentCasing_RevokesTheStoredShare()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync($"Bob{Guid.NewGuid():N}"[..16]); // mixed case, as stored
        var trackId = await seed.TrackAsync(owner);
        var albumId = await seed.AlbumAsync(owner, trackId);

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);
        (await shares.IsTrackSharedWithUserViaAlbum(trackId, recipient)).Should().BeTrue();

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [], [recipient.ToUpperInvariant()], null);

        (await seed.AlbumShares.IsAlbumSharedWithUserAsync(albumId, recipient)).Should().BeFalse();
        (await shares.IsTrackSharedWithUserViaAlbum(trackId, recipient)).Should().BeFalse();
        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(0);
        (await FeedAsync(recipient)).Should().BeEmpty();
    }

    [Fact]
    public async Task RemovingANonRecipient_LeavesShareCountAlone()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [], [Seed.NewName("nobody")], null);

        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(1);
        (await seed.AlbumShares.IsAlbumSharedWithUserAsync(albumId, recipient)).Should().BeTrue();
    }

    [Fact]
    public async Task RemoveFromLibrary_DropsOnlyTheAlbumAccess_KeepsADirectShare_AndIsIdempotent()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var directlyShared = await seed.TrackAsync(owner, 100, recipient); // also shared directly
        var albumOnly = await seed.TrackAsync(owner);
        var albumId = await seed.AlbumAsync(owner, directlyShared, albumOnly);
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        await seed.AlbumShares.RemoveAlbumFromLibraryAsync(albumId, recipient);
        await seed.AlbumShares.RemoveAlbumFromLibraryAsync(albumId, recipient);

        (await seed.AlbumShares.IsAlbumSharedWithUserAsync(albumId, recipient)).Should().BeFalse();
        (await shares.IsTrackAccessibleToUser(albumOnly, recipient)).Should().BeFalse();
        (await shares.IsTrackAccessibleToUser(directlyShared, recipient)).Should().BeTrue();
        (await seed.AlbumItemAsync(owner, albumId))!.ShareCount.Should().Be(0);
        (await FeedAsync(recipient)).Should().BeEmpty();
    }
}
