using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class FollowRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task ConcurrentDoubleFollow_WritesOneRow_AndCountsOnce()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var target = await seed.UserAsync();
        var follower = await seed.UserAsync();

        await Task.WhenAll(
            seed.Follows.FollowUser(target, follower),
            seed.Follows.FollowUser(target, follower));

        (await db.QueryAsync<UserFollowDataModel>($"FOLLOW#{target}", "USER#", QueryOperator.BeginsWith)).Should().ContainSingle();
        (await seed.ProfileAsync(target))!.FollowerCount.Should().Be(1);
        (await seed.ProfileAsync(follower))!.FollowingCount.Should().Be(1);

        await Task.WhenAll(
            seed.Follows.UnfollowUser(target, follower),
            seed.Follows.UnfollowUser(target, follower));

        (await seed.ProfileAsync(target))!.FollowerCount.Should().Be(0);
        (await seed.ProfileAsync(follower))!.FollowingCount.Should().Be(0);
        (await seed.Follows.GetFollowStatus(target, follower)).FollowStatus.Should().BeFalse();
    }

    [Fact]
    public async Task UnfollowWithoutAFollow_LeavesCountsAlone()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var target = await seed.UserAsync();
        var stranger = await seed.UserAsync();

        await seed.Follows.UnfollowUser(target, stranger);

        (await seed.ProfileAsync(target))!.FollowerCount.Should().Be(0);
        (await seed.ProfileAsync(stranger))!.FollowingCount.Should().Be(0);
    }

    [Fact]
    public async Task FollowStatus_CarriesWhenTheFollowStarted()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var target = await seed.UserAsync();
        var follower = await seed.UserAsync();
        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await seed.Follows.FollowUser(target, follower);

        var status = await seed.Follows.GetFollowStatus(target, follower);
        status.FollowStatus.Should().BeTrue();
        status.CreatedAt.Should().BeGreaterThanOrEqualTo(before);
        (await seed.Follows.GetFollowStatus(follower, target)).FollowStatus.Should().BeFalse(); // one-directional
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)] // different casing is still you
    public async Task SelfFollow_IsRejected_AndChangesNothing(bool differentCase)
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var user = await seed.UserAsync($"Me{Guid.NewGuid():N}"[..16]);

        await FluentActions.Awaiting(() =>
            seed.Follows.FollowUser(user, differentCase ? user.ToLowerInvariant() : user)).Should().ThrowAsync<ArgumentException>();

        var profile = (await seed.ProfileAsync(user))!;
        (profile.FollowerCount, profile.FollowingCount).Should().Be((0, 0));
        (await db.QueryAsync<UserFollowDataModel>($"FOLLOW#{user}", "USER#", QueryOperator.BeginsWith)).Should().BeEmpty();
        (await db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{user}", "DATE#", QueryOperator.BeginsWith)).Should().BeEmpty();
    }

    [Fact]
    public async Task FollowersAndFollowings_ComeBackNewestFirst()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var target = await seed.UserAsync();
        var first = await seed.UserAsync();
        var second = await seed.UserAsync();
        var otherTarget = await seed.UserAsync();

        await seed.Follows.FollowUser(target, first);
        await Task.Delay(5);
        await seed.Follows.FollowUser(target, second);
        await Task.Delay(5);
        await seed.Follows.FollowUser(otherTarget, first);

        var followers = (await seed.Follows.GetUserFollowers(target, 10, null)).Items.Select(u => u.Username);
        followers.Should().Equal(second, first);

        var followings = (await seed.Follows.GetUserFollowings(first, 10, null)).Items.Select(u => u.Username);
        followings.Should().Equal(otherTarget, target);
    }
}
