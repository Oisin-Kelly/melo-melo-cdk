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

        await uploads.CreateProcessingAsync(user, trackId);
        var processing = (await uploads.GetAsync(user, trackId))!;
        (processing.TrackId, processing.Status).Should().Be((trackId, UploadState.Processing));
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
        await uploads.CreateProcessingAsync(user, trackId);

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
        await uploads.CreateProcessingAsync(user, trackId.ToUpperInvariant());

        (await uploads.GetAsync(user, trackId)).Should().NotBeNull();
        (await uploads.GetAsync(Seed.NewName(), trackId)).Should().BeNull(); // someone else can't see it
        (await uploads.GetAsync(user, Guid.NewGuid().ToString("N"))).Should().BeNull();
    }
}
