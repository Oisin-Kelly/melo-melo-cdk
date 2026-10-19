using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class AlbumLikeRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<(Seed Seed, AlbumLikeRepository Likes, string Owner, string Fan, string AlbumId)> ArrangeAsync()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var albumId = await seed.AlbumAsync(owner, await seed.TrackAsync(owner));
        return (seed, new AlbumLikeRepository(db), owner, fan, albumId);
    }

    private Task<List<ActivityItemDataModel>> ActivityAsync(string username) =>
        fixture.Db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{username}", "DATE#", QueryOperator.BeginsWith);

    [Fact]
    public async Task ConcurrentDoubleLike_CountsOnce_UnlikeIsIdempotent()
    {
        var (seed, likes, owner, fan, albumId) = await ArrangeAsync();

        await Task.WhenAll(
            likes.LikeAlbumAsync(albumId, fan, owner),
            likes.LikeAlbumAsync(albumId, fan, owner));
        (await seed.AlbumItemAsync(owner, albumId))!.LikeCount.Should().Be(1);
        (await ActivityAsync(owner)).Should().ContainSingle(a => a.Type == ActivityType.AlbumLiked && a.TargetId == albumId);

        await likes.UnlikeAlbumAsync(albumId, fan, owner);
        await likes.UnlikeAlbumAsync(albumId, fan, owner); // nothing left to unlike → no-op
        (await seed.AlbumItemAsync(owner, albumId))!.LikeCount.Should().Be(0);
        (await likes.IsAlbumLikedByUserAsync(albumId, fan)).Should().BeFalse();
    }

    [Fact]
    public async Task ConcurrentDoubleUnlike_DecrementsOnce()
    {
        var (seed, likes, owner, fan, albumId) = await ArrangeAsync();
        await likes.LikeAlbumAsync(albumId, fan, owner);

        await Task.WhenAll(
            likes.UnlikeAlbumAsync(albumId, fan, owner),
            likes.UnlikeAlbumAsync(albumId, fan, owner));

        (await seed.AlbumItemAsync(owner, albumId))!.LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task SelfLike_CountsButNeverNotifiesYourself()
    {
        var (seed, likes, owner, _, albumId) = await ArrangeAsync();

        await likes.LikeAlbumAsync(albumId, owner, owner);

        (await seed.AlbumItemAsync(owner, albumId))!.LikeCount.Should().Be(1);
        (await ActivityAsync(owner)).Should().NotContain(a => a.Type == ActivityType.AlbumLiked);
    }

    [Fact]
    public async Task LikedAlbums_ReturnTheSummaryWithOwner_AndLikersListIt()
    {
        var (_, likes, owner, fan, albumId) = await ArrangeAsync();

        await likes.LikeAlbumAsync(albumId, fan, owner);

        var liked = (await likes.GetLikedAlbumsAsync(fan, 10, null)).Items.Should().ContainSingle().Subject;
        liked.Id.Should().Be(albumId);
        liked.LikedByMe.Should().BeTrue();
        liked.Owner.Username.Should().Be(owner);

        var liker = (await likes.GetAlbumLikersAsync(albumId, 10, null)).Items.Should().ContainSingle().Subject;
        liker.User.Username.Should().Be(fan);
    }

    [Fact]
    public async Task DeletingTheAlbum_RemovesItsLikes()
    {
        var (seed, likes, owner, fan, albumId) = await ArrangeAsync();
        await likes.LikeAlbumAsync(albumId, fan, owner);

        await seed.Albums.DeleteAlbumAsync(owner, albumId);

        (await likes.IsAlbumLikedByUserAsync(albumId, fan)).Should().BeFalse();
        (await likes.GetLikedAlbumsAsync(fan, 10, null)).Items.Should().BeEmpty();
    }
}
