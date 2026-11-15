using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class AlbumTracklistRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task ContainingTrack_OwnerSeesEveryAlbum_ARecipientOnlyTheOnesSharedWithThem()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var track = await seed.TrackAsync(owner);
        var other = await seed.TrackAsync(owner);
        var shared = await seed.AlbumAsync(owner, track);
        var notShared = await seed.AlbumAsync(owner, track, other);
        await seed.AlbumAsync(owner, other);
        await seed.AlbumShares.ShareAlbumAsync(shared, owner, [recipient], [], null);

        var forOwner = await seed.AlbumTracklist.GetAlbumsContainingTrackAsync(track, owner, owner);
        forOwner.Select(a => a.Id).Should().BeEquivalentTo([shared, notShared]);
        forOwner.Should().OnlyContain(a => a.Owner.Username == owner);

        (await seed.AlbumTracklist.GetAlbumsContainingTrackAsync(track, owner, recipient))
            .Select(a => a.Id).Should().Equal(shared);
        (await seed.AlbumTracklist.GetAlbumsContainingTrackAsync(track, owner, await seed.UserAsync()))
            .Should().BeEmpty();
    }

    [Fact]
    public async Task SetTracks_AddsFanOutToRecipients_RemovalsRevoke_ReordersAndRecounts()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var keep = await seed.TrackAsync(owner, 100);
        var drop = await seed.TrackAsync(owner, 40);
        var add = await seed.TrackAsync(owner, 30);
        var albumId = await seed.AlbumAsync(owner, keep, drop);
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        var (added, removed) = await seed.AlbumTracklist.SetTracksAsync(albumId, owner, [add, keep]);

        (added, removed).Should().Be((1, 1));
        (await seed.AlbumTracklist.GetAlbumTracksAsync(albumId, owner, 10, null)).Items.Select(t => t.Id).Should().Equal(add, keep);
        (await shares.IsTrackSharedWithUserViaAlbum(add, recipient)).Should().BeTrue();
        (await shares.IsTrackSharedWithUserViaAlbum(keep, recipient)).Should().BeTrue();
        (await shares.IsTrackSharedWithUserViaAlbum(drop, recipient)).Should().BeFalse();
        var item = (await seed.AlbumItemAsync(owner, albumId))!;
        (item.TrackCount, item.TotalDurationSeconds).Should().Be((2, 130));
    }

    [Fact]
    public async Task SetTracks_EmptyListClearsTheAlbum()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner, 60), await seed.TrackAsync(owner, 60));

        (await seed.AlbumTracklist.SetTracksAsync(albumId, owner, [])).Should().Be((0, 2));

        (await seed.AlbumTracklist.GetAlbumTrackIdsAsync(albumId)).Should().BeEmpty();
        var item = (await seed.AlbumItemAsync(owner, albumId))!;
        (item.TrackCount, item.TotalDurationSeconds).Should().Be((0, 0));
    }

    [Fact]
    public async Task RemoveTrackFromAllAlbums_OnlyTouchesAlbumsContainingIt()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var shared = await seed.TrackAsync(owner, 100);
        var other = await seed.TrackAsync(owner, 50);
        var withIt = await seed.AlbumAsync(owner, shared, other);
        var without = await seed.AlbumAsync(owner, other);

        await seed.AlbumTracklist.RemoveTrackFromAllAlbumsAsync(owner, shared);

        (await seed.AlbumTracklist.GetAlbumTrackIdsAsync(withIt)).Should().Equal(other);
        var withItItem = (await seed.AlbumItemAsync(owner, withIt))!;
        (withItItem.TrackCount, withItItem.TotalDurationSeconds).Should().Be((1, 50));
        (await seed.AlbumItemAsync(owner, without))!.TrackCount.Should().Be(1);
    }
}
