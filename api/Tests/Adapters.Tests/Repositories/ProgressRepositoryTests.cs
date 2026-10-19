using Adapters.Repositories;

namespace Adapters.Tests.Repositories;

// One resume slot per user; GET /me/progress only returns it while its track still resolves
// and the user can still play it.
[Collection(DynamoDbLocalCollection.Name)]
public class ProgressRepositoryTests(DynamoDbLocalFixture fixture)
{
    private ProgressRepository Progress(Seed seed) =>
        new(fixture.Db, seed.Tracks, new SharedTrackRepository(fixture.Db));

    [Fact]
    public async Task Upsert_ThenRead_ReturnsTheSlotWithTheTrack()
    {
        var seed = new Seed(fixture.Db);
        var progress = Progress(seed);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 300);

        await progress.UpsertAsync(owner, "ALBUM", "ALB1", trackId.ToUpperInvariant(), 42);

        var slot = (await progress.GetResolvableAsync(owner))!;
        (slot.ContextType, slot.ContextId, slot.TrackId, slot.PositionSeconds).Should().Be(("ALBUM", "alb1", trackId, 42));
        (slot.Track.Id, slot.Track.Duration, slot.Track.Owner.Username).Should().Be((trackId, 300, owner));
    }

    [Fact]
    public async Task Upsert_OverwritesTheSingleSlot()
    {
        var seed = new Seed(fixture.Db);
        var progress = Progress(seed);
        var owner = await seed.UserAsync();
        var first = await seed.TrackAsync(owner);
        var second = await seed.TrackAsync(owner);

        await progress.UpsertAsync(owner, "TRACK", first, first, 10);
        await progress.UpsertAsync(owner, "PLAYLIST", "pl1", second, 99);

        var slot = (await progress.GetResolvableAsync(owner))!;
        (slot.TrackId, slot.PositionSeconds, slot.ContextType).Should().Be((second, 99, "PLAYLIST"));
    }

    [Fact]
    public async Task Clear_RemovesTheSlot_AndNothingSavedIsNull()
    {
        var seed = new Seed(fixture.Db);
        var progress = Progress(seed);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        (await progress.GetResolvableAsync(owner)).Should().BeNull();

        await progress.UpsertAsync(owner, "TRACK", trackId, trackId, 10);
        await progress.ClearAsync(owner);

        (await progress.GetResolvableAsync(owner)).Should().BeNull();
    }

    [Fact]
    public async Task DeletedTrack_IsNotResumable()
    {
        var seed = new Seed(fixture.Db);
        var progress = Progress(seed);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        await progress.UpsertAsync(owner, "TRACK", trackId, trackId, 10);

        await seed.Tracks.DeleteTrackAsync(owner, trackId);

        (await progress.GetResolvableAsync(owner)).Should().BeNull();
    }

    [Fact]
    public async Task Recipient_CanResumeASharedTrack_UntilItIsUnshared()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var progress = Progress(seed);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner, 100, recipient);
        await progress.UpsertAsync(recipient, "TRACK", trackId, trackId, 30);
        await new LikeRepository(db).LikeTrackAsync(trackId, recipient, owner, 100);

        var slot = (await progress.GetResolvableAsync(recipient))!;
        slot.Track.LikedByMe.Should().BeTrue();

        await new SharedTrackRepository(db).ShareTrackAsync(trackId, owner, [], [recipient], null);

        (await progress.GetResolvableAsync(recipient)).Should().BeNull();
    }
}
