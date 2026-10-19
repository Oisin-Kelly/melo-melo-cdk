using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class AlbumRepositoryTests(DynamoDbLocalFixture fixture)
{
    private Task<List<FeedItemDataModel>> FeedAsync(string username) =>
        fixture.Db.QueryAsync<FeedItemDataModel>($"FEED#{username}", FeedItemType.Album, QueryOperator.BeginsWith);

    [Fact]
    public async Task Create_SetsCounters_AndKeepsTracklistOrder()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var a = await seed.TrackAsync(owner, 100);
        var b = await seed.TrackAsync(owner, 50);

        var albumId = await seed.AlbumAsync(owner, b, a);

        var item = (await seed.AlbumItemAsync(owner, albumId))!;
        (item.TrackCount, item.TotalDurationSeconds).Should().Be((2, 150));
        var tracks = (await seed.AlbumTracklist.GetAlbumTracksAsync(albumId, owner, 10, null)).Items;
        tracks.Select(t => t.Id).Should().Equal(b, a);
    }

    [Fact]
    public async Task Delete_RevokesGrants_RemovesSharesAndFeed_LeavesTheTracks()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        var albumId = await seed.AlbumAsync(owner, trackId);
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);

        await seed.Albums.DeleteAlbumAsync(owner, albumId);

        (await seed.Albums.GetAlbumByIdAsync(albumId)).Should().BeNull();
        (await shares.IsTrackSharedWithUserViaAlbum(trackId, recipient)).Should().BeFalse();
        (await seed.AlbumShares.GetAlbumsSharedWithUserAsync(recipient, 10, null)).Items.Should().BeEmpty();
        (await FeedAsync(recipient)).Should().BeEmpty();
        (await seed.TrackItemAsync(owner, trackId)).Should().NotBeNull();
    }
}
