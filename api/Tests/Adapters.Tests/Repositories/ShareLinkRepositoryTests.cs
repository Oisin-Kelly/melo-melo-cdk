using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class ShareLinkRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task Create_ThenGet_AndListNewestFirst()
    {
        var links = new ShareLinkRepository(fixture.Db);
        var owner = Seed.NewName();
        var trackId = Guid.NewGuid().ToString("N");

        var first = await links.CreateAsync(owner, ShareLinkKind.Track, trackId, TimeSpan.FromDays(7));
        await Task.Delay(5);
        var second = await links.CreateAsync(owner, ShareLinkKind.Track, trackId, TimeSpan.FromHours(24), "a note");
        (await links.GetAsync(second.Token))!.Caption.Should().Be("a note");

        var read = (await links.GetAsync(first.Token))!;
        (read.Owner, read.Kind, read.TargetId, read.AcceptedCount)
            .Should().Be((owner, ShareLinkKind.Track, trackId, 0));
        read.ExpiresAt.Should().Be(DateTimeOffset.FromUnixTimeMilliseconds(read.LinkExpiresAt)
            .Add(ShareLinks.ExpiredGrace).ToUnixTimeSeconds());

        (await links.ListForTargetAsync(ShareLinkKind.Track, trackId)).Select(l => l.Token)
            .Should().Equal(second.Token, first.Token);
        (await links.ListForTargetAsync(ShareLinkKind.Album, trackId)).Should().BeEmpty();
    }

    [Fact]
    public async Task Get_MalformedOrUnknownToken_IsNull()
    {
        var links = new ShareLinkRepository(fixture.Db);
        (await links.GetAsync("not a token")).Should().BeNull();
        (await links.GetAsync(ShareLinks.NewToken())).Should().BeNull();
    }

    [Fact]
    public async Task Claim_CountsWhileLive_RevokeStopsIt_RestoreReopens()
    {
        var links = new ShareLinkRepository(fixture.Db);
        var link = await links.CreateAsync(Seed.NewName(), ShareLinkKind.Album, "a1", TimeSpan.FromDays(1));

        (await links.TryClaimAsync(link.Token)).Should().BeTrue();
        (await links.TryClaimAsync(link.Token)).Should().BeTrue();

        await links.RevokeAsync(link.Token);
        var revoked = (await links.GetAsync(link.Token))!;
        revoked.RevokedAt.Should().NotBeNull();
        (await links.TryClaimAsync(link.Token)).Should().BeFalse();

        await links.RevokeAsync(link.Token); // idempotent: keeps the first revoke time
        (await links.GetAsync(link.Token))!.RevokedAt.Should().Be(revoked.RevokedAt);

        await links.RestoreAsync(link.Token);
        (await links.TryClaimAsync(link.Token)).Should().BeTrue();
        (await links.GetAsync(link.Token))!.AcceptedCount.Should().Be(3);
    }

    [Fact]
    public async Task Claim_ExpiredOrUnknown_IsFalse_AndRevokingUnknownCreatesNothing()
    {
        var links = new ShareLinkRepository(fixture.Db);
        var expired = await links.CreateAsync(Seed.NewName(), ShareLinkKind.Track, "t1",
            TimeSpan.FromMilliseconds(-1));
        (await links.TryClaimAsync(expired.Token)).Should().BeFalse();

        var unknown = ShareLinks.NewToken();
        (await links.TryClaimAsync(unknown)).Should().BeFalse();
        await links.RevokeAsync(unknown);
        (await links.GetAsync(unknown)).Should().BeNull();
    }

    [Fact]
    public async Task DeletingTheTrackOrAlbum_DeletesItsLinks()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);
        var albumId = await seed.AlbumAsync(owner, trackId);
        var trackLink = await seed.Links.CreateAsync(owner, ShareLinkKind.Track, trackId, TimeSpan.FromDays(1));
        var albumLink = await seed.Links.CreateAsync(owner, ShareLinkKind.Album, albumId, TimeSpan.FromDays(1));

        await seed.Albums.DeleteAlbumAsync(owner, albumId);
        (await seed.Links.GetAsync(albumLink.Token)).Should().BeNull();
        (await seed.Links.GetAsync(trackLink.Token)).Should().NotBeNull();

        await seed.Tracks.DeleteTrackAsync(owner, trackId);
        (await seed.Links.GetAsync(trackLink.Token)).Should().BeNull();
    }

    [Fact]
    public async Task ShareWithoutNotifying_WritesTheShareAndFeed_ButNoActivity()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();
        var recipient = await seed.UserAsync();
        var trackId = await seed.TrackAsync(owner);

        await seed.Shares.ShareTrackAsync(trackId, owner, [recipient], [], null, notifyRecipients: false);

        (await seed.Shares.IsTrackSharedWithUser(trackId, recipient)).Should().BeTrue();
        (await fixture.Db.QueryAsync<FeedItemDataModel>($"FEED#{recipient}")).Should().ContainSingle();
        (await fixture.Db.QueryAsync<ActivityItemDataModel>($"ACTIVITY#{recipient}")).Should().BeEmpty();
    }
}
