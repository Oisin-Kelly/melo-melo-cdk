using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class LikeRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<(Seed Seed, LikeRepository Likes, string Owner, string Fan, string TrackId)> ArrangeAsync(
        int duration = 200)
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, duration, fan);
        return (seed, new LikeRepository(db), owner, fan, trackId);
    }

    private Task<List<ActivityItemDataModel>> OwnerActivityAsync(string owner) =>
        fixture.Db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{owner}", "DATE#", QueryOperator.BeginsWith);

    [Fact]
    public async Task Like_CountsOnTheTrackAndTheLikersLikesPlaylist_AndNotifiesTheOwner()
    {
        var (seed, likes, owner, fan, trackId) = await ArrangeAsync(200);

        await likes.LikeTrackAsync(trackId, fan, owner, 200);

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(1);
        var likesPlaylist = (await seed.LikesPlaylistAsync(fan))!;
        (likesPlaylist.TrackCount, likesPlaylist.TotalDurationSeconds).Should().Be((1, 200));
        (await likes.IsTrackLikedByUserAsync(trackId, fan)).Should().BeTrue();

        var row = (await OwnerActivityAsync(owner)).Should().ContainSingle(a => a.Type == ActivityType.TrackLiked).Subject;
        row.ActorUsername.Should().Be(fan);
        row.TargetId.Should().Be(trackId);
    }

    [Fact]
    public async Task ConcurrentDoubleLike_CountsOnce_AndWritesOneActivityRow()
    {
        var (seed, likes, owner, fan, trackId) = await ArrangeAsync(200);

        await Task.WhenAll(
            likes.LikeTrackAsync(trackId, fan, owner, 200),
            likes.LikeTrackAsync(trackId, fan, owner, 200));

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(1);
        var likesPlaylist = (await seed.LikesPlaylistAsync(fan))!;
        (likesPlaylist.TrackCount, likesPlaylist.TotalDurationSeconds).Should().Be((1, 200));
        (await OwnerActivityAsync(owner)).Should().ContainSingle(a => a.Type == ActivityType.TrackLiked && a.TargetId == trackId);
    }

    [Fact]
    public async Task SequentialDoubleLike_IsANoOp()
    {
        var (seed, likes, owner, fan, trackId) = await ArrangeAsync(200);

        await likes.LikeTrackAsync(trackId, fan, owner, 200);
        await likes.LikeTrackAsync(trackId, fan, owner, 200);

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(1);
        (await seed.LikesPlaylistAsync(fan))!.TrackCount.Should().Be(1);
        (await OwnerActivityAsync(owner)).Should().ContainSingle();
    }

    [Fact]
    public async Task SelfLike_CountsButNeverNotifiesYourself()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var likes = new LikeRepository(db);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 120);

        await likes.LikeTrackAsync(trackId, owner, owner, 120);

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(1);
        (await seed.LikesPlaylistAsync(owner))!.TrackCount.Should().Be(1);
        (await OwnerActivityAsync(owner)).Should().BeEmpty();
    }

    [Fact]
    public async Task ConcurrentDoubleUnlike_DecrementsOnce()
    {
        var (seed, likes, owner, fan, trackId) = await ArrangeAsync(200);
        await likes.LikeTrackAsync(trackId, fan, owner, 200);

        await Task.WhenAll(
            likes.UnlikeTrackAsync(trackId, fan, owner),
            likes.UnlikeTrackAsync(trackId, fan, owner));

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(0);
        var likesPlaylist = (await seed.LikesPlaylistAsync(fan))!;
        (likesPlaylist.TrackCount, likesPlaylist.TotalDurationSeconds).Should().Be((0, 0));
        (await likes.IsTrackLikedByUserAsync(trackId, fan)).Should().BeFalse();
    }

    [Fact]
    public async Task UnlikeWithoutALike_LeavesCountersAlone()
    {
        var (seed, likes, owner, fan, trackId) = await ArrangeAsync(200);

        await likes.UnlikeTrackAsync(trackId, fan, owner);

        (await seed.TrackItemAsync(owner, trackId))!.LikeCount.Should().Be(0);
        (await seed.LikesPlaylistAsync(fan))!.TrackCount.Should().Be(0);
    }

    [Fact]
    public async Task LikedTracks_AreNewestFirst_AndCarryWhenTheyWereLiked()
    {
        var (seed, likes, owner, fan, first) = await ArrangeAsync(90);
        var second = await seed.TrackAsync(owner, 60, fan);
        var created = (await seed.TrackItemAsync(owner, first))!.CreatedAt;

        await Task.Delay(20); // so likedAt is distinguishable from the tracks' createdAt
        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await likes.LikeTrackAsync(first, fan, owner, 90);
        await Task.Delay(5);
        await likes.LikeTrackAsync(second, fan, owner, 60);

        var liked = (await likes.GetLikedTracksAsync(fan, 10, null)).Items;
        liked.Select(l => l.Track.Id).Should().Equal(second, first);
        liked.Should().OnlyContain(l => l.LikedAt >= before && l.LikedAt > created);
        liked.Should().OnlyContain(l => l.Track.LikedByMe);
    }

    [Fact]
    public async Task TrackLikers_ListsEveryLikerWithTheirProfile()
    {
        var (seed, likes, owner, fanA, trackId) = await ArrangeAsync(100);
        var fanB = await seed.UserAsync();

        await likes.LikeTrackAsync(trackId, fanA, owner, 100);
        await likes.LikeTrackAsync(trackId, fanB, owner, 100);

        var likers = (await likes.GetTrackLikersAsync(trackId, 10, null)).Items.Select(l => l.User.Username);
        likers.Should().BeEquivalentTo(new[] { fanA, fanB }); // order isn't part of the contract
    }
}
