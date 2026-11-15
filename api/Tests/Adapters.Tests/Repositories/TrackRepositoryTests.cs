using Adapters.Repositories;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class TrackRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task Create_WithRecipients_SharesFeedsAndNotifiesEach_AndCountsThem()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var owner = await seed.UserAsync();
        var a = await seed.UserAsync();
        var b = await seed.UserAsync();

        var trackId = await seed.TrackAsync(owner, 180, a, b);

        (await seed.TrackItemAsync(owner, trackId))!.ShareCount.Should().Be(2);
        foreach (var recipient in new[] { a, b })
        {
            (await shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeTrue();
            (await db.QueryAsync<FeedItemDataModel>($"FEED#{recipient}", FeedItemType.Track, QueryOperator.BeginsWith)).Should().ContainSingle();
            await fixture.ProcessStreamAsync();
            (await db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{recipient}", "DATE#", QueryOperator.BeginsWith)).Should().ContainSingle(r => r.Type == ActivityType.TrackShared && r.TargetId == trackId);
        }
    }

    [Fact]
    public async Task GetTrack_ResolvesTheOwner_UnknownIdIsNull()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 95);

        var track = (await seed.Tracks.GetTrackAsync(trackId.ToUpperInvariant()))!; // ids are case-insensitive
        (track.Id, track.Owner.Username, track.Duration).Should().Be((trackId, owner, 95));
        (await seed.Tracks.GetTrackAsync(Guid.NewGuid().ToString("N"))).Should().BeNull();
    }

    [Fact]
    public async Task GetTracksByUsername_IsNewestFirst()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var older = await seed.TrackAsync(owner);
        await Task.Delay(5);
        var newer = await seed.TrackAsync(owner);

        var tracks = (await seed.Tracks.GetTracksByUsername(owner, 10, null)).Items;
        tracks.Select(t => t.Id).Should().Equal(newer, older);
    }

    [Fact]
    public async Task GetOwnedTrackIds_KeepsOnlyTheOwnersTracks()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var someoneElse = await seed.UserAsync();
        var mine = await seed.TrackAsync(owner);
        var theirs = await seed.TrackAsync(someoneElse);

        var owned = await seed.Tracks.GetOwnedTrackIdsAsync(owner,
            [mine.ToUpperInvariant(), mine, theirs, Guid.NewGuid().ToString("N")]);

        owned.Should().Equal(mine);
    }

    [Fact]
    public async Task Update_SetsFields_AndBlankOptionalFieldsAreRemoved()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);

        await seed.Tracks.UpdateTrackAsync(owner, trackId, "Renamed", "jazz", "notes", null, false);
        var updated = (await seed.Tracks.UpdateTrackAsync(owner, trackId, "Renamed again", null, "  ", null, false))!;

        updated.TrackName.Should().Be("Renamed again");
        updated.Genre.Should().BeNull();
        updated.Description.Should().BeNull();
    }

    [Fact]
    public async Task Delete_RemovesSharesFeedAndUploadStatus()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var shares = new SharedTrackRepository(db);
        var uploads = new UploadStatusRepository(db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 100, recipient);
        await uploads.CreateProcessingAsync(owner, trackId);

        await seed.Tracks.DeleteTrackAsync(owner, trackId);

        (await seed.Tracks.GetTrackAsync(trackId)).Should().BeNull();
        (await shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeFalse();
        (await shares.GetTracksSharedWithUser(recipient, 10, null)).Items.Should().BeEmpty();
        (await db.QueryAsync<FeedItemDataModel>($"FEED#{recipient}", FeedItemType.Track, QueryOperator.BeginsWith)).Should().BeEmpty();
        (await uploads.GetAsync(owner, trackId)).Should().BeNull();
    }

    [Fact]
    public async Task DeletingALikedTrack_DecrementsEveryLikersLikesPlaylist()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var likes = new LikeRepository(db);
        var owner = await seed.UserAsync();
        var fanA = await seed.UserAsync();
        var fanB = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 250, fanA, fanB);
        await likes.LikeTrackAsync(trackId, fanA, owner, 250);
        await likes.LikeTrackAsync(trackId, fanB, owner, 250);

        await seed.Tracks.DeleteTrackAsync(owner, trackId);

        foreach (var fan in new[] { fanA, fanB })
        {
            var likesPlaylist = (await seed.LikesPlaylistAsync(fan))!;
            (likesPlaylist.TrackCount, likesPlaylist.TotalDurationSeconds).Should().Be((0, 0));
            (await likes.GetLikedTracksAsync(fan, 10, null)).Items.Should().BeEmpty();
        }
        (await seed.TrackItemAsync(owner, trackId)).Should().BeNull();
    }

    [Fact]
    public async Task DeletingATrackTwice_DoesNotDecrementLikersAgain()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var likes = new LikeRepository(db);
        var owner = await seed.UserAsync();
        var fan = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 100, fan);
        await likes.LikeTrackAsync(trackId, fan, owner, 100);

        await seed.Tracks.DeleteTrackAsync(owner, trackId);
        await seed.Tracks.DeleteTrackAsync(owner, trackId); // a retried delete

        var likesPlaylist = (await seed.LikesPlaylistAsync(fan))!;
        (likesPlaylist.TrackCount, likesPlaylist.TotalDurationSeconds).Should().Be((0, 0));
    }
}
