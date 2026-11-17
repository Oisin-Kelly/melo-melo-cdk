using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class UploadStatusRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task Processing_ThenComplete()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");

        await uploads.CreateProcessingAsync(user, trackId, "Song");
        var processing = (await uploads.GetAsync(user, trackId))!;
        (processing.TrackId, processing.Status, processing.Name).Should().Be((trackId, UploadState.Processing, "Song"));
        processing.Error.Should().BeNull();

        await uploads.MarkCompleteAsync(user, trackId);
        var complete = (await uploads.GetAsync(user, trackId))!;
        complete.Status.Should().Be(UploadState.Complete);
        complete.CreatedAt.Should().Be(processing.CreatedAt);
    }

    [Fact]
    public async Task Failed_CarriesTheUserSafeReason()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");
        await uploads.CreateProcessingAsync(user, trackId, "Song");

        await uploads.MarkFailedAsync(user, trackId, "Audio is longer than the 24 hour limit.");

        var failed = (await uploads.GetAsync(user, trackId))!;
        (failed.Status, failed.Error).Should().Be((UploadState.Failed, "Audio is longer than the 24 hour limit."));
    }

    [Fact]
    public async Task TrackIds_AreCaseInsensitive_AndScopedToTheUploader()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");
        await uploads.CreateProcessingAsync(user, trackId.ToUpperInvariant(), "Song");

        (await uploads.GetAsync(user, trackId)).Should().NotBeNull();
        (await uploads.GetAsync(Seed.NewName(), trackId)).Should().BeNull(); // someone else can't see it
        (await uploads.GetAsync(user, Guid.NewGuid().ToString("N"))).Should().BeNull();
    }

    [Fact]
    public async Task Unfinished_IsProcessingAndFailed_NewestFirst_WithoutTheFinished()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var (failed, done, busy) = (Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"));
        await uploads.CreateProcessingAsync(user, failed, "Failed one");
        await uploads.MarkFailedAsync(user, failed, "not an audio file");
        await Task.Delay(5);
        await uploads.CreateProcessingAsync(user, done, "Done one");
        await uploads.MarkCompleteAsync(user, done);
        await Task.Delay(5);
        await uploads.CreateProcessingAsync(user, busy, "Busy one");

        var unfinished = await uploads.GetUnfinishedAsync(user);

        unfinished.Select(u => (u.TrackId, u.Name, u.Status)).Should().Equal(
            (busy, "Busy one", UploadState.Processing),
            (failed, "Failed one", UploadState.Failed));
        (await uploads.GetUnfinishedAsync(Seed.NewName())).Should().BeEmpty();
    }

    [Fact]
    public async Task Processing_PastTheStaleLimit_ReadsAsFailed()
    {
        var user = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");
        var startedAt = DateTimeOffset.UtcNow - UploadStatusRepository.StaleAfter - TimeSpan.FromMinutes(1);
        await fixture.Db.WriteToDynamoAsync(new UploadStatusDataModel
        {
            Pk = $"USER#{user}",
            Sk = $"UPLOAD#{trackId}",
            Status = UploadState.Processing,
            TrackName = "Stuck",
            CreatedAt = startedAt.ToUnixTimeMilliseconds(),
            ExpiresAt = startedAt.AddHours(24).ToUnixTimeSeconds(),
        });
        var uploads = new UploadStatusRepository(fixture.Db);

        var stuck = (await uploads.GetUnfinishedAsync(user)).Single();
        (stuck.Status, stuck.Error).Should().Be((UploadState.Failed, UploadStatusRepository.StaleReason));
        (await uploads.DismissAsync(user, trackId)).Should().BeTrue(); // so it can be cleared
        (await uploads.GetAsync(user, trackId)).Should().BeNull();
    }

    [Fact]
    public async Task Dismiss_RemovesAFailedUpload_RefusesOneStillProcessing_IgnoresUnknown()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var (failed, busy) = (Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"));
        await uploads.CreateProcessingAsync(user, failed, "Failed one");
        await uploads.MarkFailedAsync(user, failed, "not an audio file");
        await uploads.CreateProcessingAsync(user, busy, "Busy one");

        (await uploads.DismissAsync(user, failed)).Should().BeTrue();
        (await uploads.DismissAsync(user, busy)).Should().BeFalse();
        (await uploads.DismissAsync(user, Guid.NewGuid().ToString("N"))).Should().BeTrue();

        (await uploads.GetUnfinishedAsync(user)).Select(u => u.TrackId).Should().Equal(busy);
    }

    [Fact]
    public async Task AStatusUpdate_AfterDismissing_DoesNotBringTheRecordBack()
    {
        var uploads = new UploadStatusRepository(fixture.Db);
        var user = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");
        await uploads.CreateProcessingAsync(user, trackId, "Song");
        await uploads.DeleteAsync(user, trackId);

        await uploads.MarkCompleteAsync(user, trackId);
        await uploads.MarkFailedAsync(user, trackId, "late");

        (await uploads.GetAsync(user, trackId)).Should().BeNull();
    }
}
