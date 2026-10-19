using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class FeedRepositoryTests(DynamoDbLocalFixture fixture)
{
    // A recipient with one track share and one album share, the album shared second
    private async Task<(Seed Seed, FeedRepository Feed, string Owner, string Recipient, string TrackId, string AlbumId)>
        ArrangeAsync()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        await new SharedTrackRepository(db).ShareTrackAsync(trackId, owner, [recipient], [], "a track");
        await Task.Delay(5);
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));
        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);
        return (seed, new FeedRepository(db), owner, recipient, trackId, albumId);
    }

    [Fact]
    public async Task AllTypes_InterleavedNewestFirst_WithSenderAndCaption()
    {
        var (_, feed, owner, recipient, trackId, albumId) = await ArrangeAsync();

        var items = (await feed.GetFeedAsync(recipient, null, false, 10, null)).Items;

        items.Select(i => i.Type).Should().Equal(FeedItemType.Album, FeedItemType.Track);
        items[0].Album!.Id.Should().Be(albumId);
        items[0].Track.Should().BeNull();
        (items[1].Track!.Id, items[1].Caption).Should().Be((trackId, "a track"));
        items.Should().OnlyContain(i => i.Sender.Username == owner);
    }

    [Fact]
    public async Task Ascending_ReversesTheOrder()
    {
        var (_, feed, _, recipient, _, _) = await ArrangeAsync();

        var items = (await feed.GetFeedAsync(recipient, null, true, 10, null)).Items;

        items.Select(i => i.Type).Should().Equal(FeedItemType.Track, FeedItemType.Album);
    }

    [Theory]
    [InlineData(FeedItemType.Track)]
    [InlineData(FeedItemType.Album)]
    public async Task TypeFilter_ReturnsOnlyThatType(string type)
    {
        var (_, feed, _, recipient, _, _) = await ArrangeAsync();

        var item = (await feed.GetFeedAsync(recipient, type, false, 10, null)).Items.Should().ContainSingle().Subject;
        item.Type.Should().Be(type);
    }

    [Fact]
    public async Task DeletedTargets_DropOutOfTheFeed()
    {
        var db = fixture.Db;
        var (seed, feed, owner, recipient, trackId, albumId) = await ArrangeAsync();

        await seed.Tracks.DeleteTrackAsync(owner, trackId);
        await seed.Albums.DeleteAlbumAsync(owner, albumId);

        (await feed.GetFeedAsync(recipient, null, false, 10, null)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Paging_FollowsTheCursorToTheEnd()
    {
        var (_, feed, _, recipient, _, _) = await ArrangeAsync();

        var first = await feed.GetFeedAsync(recipient, null, false, 1, null);
        var second = await feed.GetFeedAsync(recipient, null, false, 1, first.NextCursor);

        first.Items.Should().ContainSingle();
        first.NextCursor.Should().NotBeNull();
        second.Items.Should().ContainSingle();
        second.Items[0].Type.Should().NotBe(first.Items[0].Type);
    }

    [Fact]
    public async Task UnknownUser_HasAnEmptyFeed()
    {
        var feed = new FeedRepository(fixture.Db);

        var page = await feed.GetFeedAsync(Seed.NewName("nobody"), null, false, 10, null);

        page.Items.Should().BeEmpty();
        page.NextCursor.Should().BeNull();
    }
}
