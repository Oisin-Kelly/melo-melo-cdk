using Amazon.DynamoDBv2.DocumentModel;
using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

// GET /activity: rows follow from likes/shares/follows through the stream consumer
// (ActivityEvents) — each read here first processes the stream, as production would have —
// and show while their actor + target still resolve.
[Collection(DynamoDbLocalCollection.Name)]
public class ActivityRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<PaginatedResult<ActivityEntry>> ActivityAsync(string username, int pageSize, string? cursor)
    {
        await fixture.ProcessStreamAsync();
        return await new ActivityRepository(fixture.Db).GetActivityAsync(username, pageSize, cursor);
    }

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
        Rows(await ActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(1);

        await likes.UnlikeTrackAsync(trackId, fan, owner);
        Rows(await ActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(0);

        await Task.Delay(5); // distinct likedAt for the second like
        await likes.LikeTrackAsync(trackId, fan, owner, 120);
        // The unlike deleted the first row; the re-like wrote a new one
        Rows(await ActivityAsync(owner, 50, null), ActivityType.TrackLiked, trackId).Should().Be(1);
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

        var row = (await ActivityAsync(owner, 50, null)).Items.Should().ContainSingle().Subject;
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
        Rows(await ActivityAsync(recipient, 50, null), ActivityType.TrackShared, trackId).Should().Be(1);

        await shares.ShareTrackAsync(trackId, owner, [], [recipient], null);
        Rows(await ActivityAsync(recipient, 50, null), ActivityType.TrackShared, trackId).Should().Be(0);
    }

    [Fact]
    public async Task ReShare_ReplacesTheRow_ItMovesToTheTop()
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

        var page = await ActivityAsync(recipient, 50, null);
        var row = page.Items.Should().ContainSingle(a => a.Type == ActivityType.TrackShared && a.TargetId == trackId).Subject;
        var shareRecord = (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Single();
        row.CreatedAt.Should().Be(shareRecord.SharedAt);
        // Replaced, not hidden: the first share's row is gone from the table
        (await db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{recipient}", "DATE#", QueryOperator.BeginsWith))
            .Should().ContainSingle();
    }

    [Fact]
    public async Task ShareLinkAccept_GivesTheRecipientNoActivity_ButAnOwnerShareLaterDoes()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);

        await shares.ShareTrackAsync(trackId, owner, [recipient], [], null, notifyRecipients: false);
        (await ActivityAsync(recipient, 50, null)).Items.Should().BeEmpty();

        // The owner sharing it with them again is a real share: it says so
        await Task.Delay(5);
        await shares.ShareTrackAsync(trackId, owner, [recipient], [], "this one");
        Rows(await ActivityAsync(recipient, 50, null), ActivityType.TrackShared, trackId).Should().Be(1);
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
        Rows(await ActivityAsync(recipient, 50, null), ActivityType.AlbumShared, albumId).Should().Be(1);

        await seed.AlbumShares.RemoveAlbumFromLibraryAsync(albumId, recipient);
        Rows(await ActivityAsync(recipient, 50, null), ActivityType.AlbumShared, albumId).Should().Be(0);
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
        var row = (await ActivityAsync(target, 50, null)).Items.Should().ContainSingle().Subject;
        (row.Type, row.Actor.Username, row.TargetType).Should().Be((ActivityType.UserFollowed, follower, ActivityTargetType.User));

        await seed.Follows.UnfollowUser(target, follower);
        (await ActivityAsync(target, 50, null)).Items.Should().BeEmpty();
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

        (await ActivityAsync(owner, 50, null)).Items.Should().BeEmpty();
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
