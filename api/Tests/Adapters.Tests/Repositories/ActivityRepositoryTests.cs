using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

// GET /activity is a live snapshot: a row shows only while the exact relationship record that
// produced it (same likedAt/sharedAt) still exists, and its actor + target still resolve.
[Collection(DynamoDbLocalCollection.Name)]
public class ActivityRepositoryTests(DynamoDbLocalFixture fixture)
{
    private static int Rows(PaginatedResult<ActivityEntry> page, string type, string targetId) =>
        page.Items.Count(a => a.Type == type && a.TargetId == targetId);

    [Fact]
    public async Task UnlikeThenReLike_ShowsOneLikeRow_NotTheOldOneRevived()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var likes = new LikeRepository(db);
        var activity = new ActivityRepository(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 120, fan);

        await likes.LikeTrackAsync(trackId, fan, owner, 120);
        Rows(await activity.GetActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(1);

        await likes.UnlikeTrackAsync(trackId, fan, owner);
        Rows(await activity.GetActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(0);

        await Task.Delay(5); // distinct likedAt for the second like
        await likes.LikeTrackAsync(trackId, fan, owner, 120);
        // Two raw activity rows now exist; only the one matching the live like's likedAt shows
        Rows(await activity.GetActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(1);
    }

    [Fact]
    public async Task LikeRow_IsHydratedWithActorAndTargetName()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 120, fan);
        await new LikeRepository(db).LikeTrackAsync(trackId, fan, owner, 120);

        var row = (await new ActivityRepository(db).GetActivityAsync(owner, 50, null)).Items.Should().ContainSingle().Subject;
        row.Actor.Username.Should().Be(fan);
        row.TargetType.Should().Be(FeedItemType.Track);
        row.TargetName.Should().Be((await seed.TrackItemAsync(owner, trackId))!.TrackName);
    }

    [Fact]
    public async Task TrackShare_ShowsForTheRecipient_UnshareHidesIt()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var activity = new ActivityRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);

        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "listen to this");
        Rows(await activity.GetActivityAsync(recipient, 50, null), ActivityType.TrackShared, trackId).Should().Be(1);

        await shares.ShareTrackAsync(trackId, owner, [], [recipient], null);
        Rows(await activity.GetActivityAsync(recipient, 50, null), ActivityType.TrackShared, trackId).Should().Be(0);
    }

    [Fact]
    public async Task ReShare_ShowsOnlyTheNewestShareRow()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);

        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "first");
        await Task.Delay(5);
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "again");

        var page = await new ActivityRepository(db).GetActivityAsync(recipient, 50, null);
        var row = page.Items.Should().ContainSingle(a => a.Type == ActivityType.TrackShared && a.TargetId == trackId).Subject;
        var shareRecord = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Single();
        row.CreatedAt.Should().Be(shareRecord.SharedAt);
    }

    [Fact]
    public async Task AlbumShare_Shows_RemoveFromLibraryHidesIt()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var activity = new ActivityRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));

        await seed.AlbumShares.ShareAlbumAsync(albumId, owner, [recipient], [], null);
        Rows(await activity.GetActivityAsync(recipient, 50, null), ActivityType.AlbumShared, albumId).Should().Be(1);

        await seed.AlbumShares.RemoveAlbumFromLibraryAsync(albumId, recipient);
        Rows(await activity.GetActivityAsync(recipient, 50, null), ActivityType.AlbumShared, albumId).Should().Be(0);
    }

    [Fact]
    public async Task Follow_ShowsForTheFollowed_UnfollowRemovesIt()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var activity = new ActivityRepository(db);
        var target = await seed.UserAsync();
        var follower = await seed.UserAsync();

        await seed.Follows.FollowUser(target, follower);
        var row = (await activity.GetActivityAsync(target, 50, null)).Items.Should().ContainSingle().Subject;
        (row.Type, row.Actor.Username, row.TargetType).Should().Be((ActivityType.UserFollowed, follower, ActivityTargetType.User));

        await seed.Follows.UnfollowUser(target, follower);
        (await activity.GetActivityAsync(target, 50, null)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task DeletedTrack_DropsItsLikeRow()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 120, fan);
        await new LikeRepository(db).LikeTrackAsync(trackId, fan, owner, 120);

        await seed.Tracks.DeleteTrackAsync(owner, trackId);

        (await new ActivityRepository(db).GetActivityAsync(owner, 50, null)).Items.Should().BeEmpty();
    }

    [Fact]
    public async Task MarkActivitySeen_RecordsWhen()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var user = await seed.UserAsync();
        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await new ActivityRepository(db).MarkActivitySeenAsync(user);

        var (_, activitySeenAt) = await seed.Users.GetSeenMarkersAsync(user);
        activitySeenAt.Should().BeGreaterThanOrEqualTo(before);
    }
}
