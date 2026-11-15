using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class PlaylistRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<(Seed Seed, PlaylistRepository Playlists, string Owner, string PlaylistId)> ArrangeAsync()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var playlists = new PlaylistRepository(db);
        var owner = await seed.UserAsync();
        var playlistId = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(playlistId, owner, "Mix", null, null);
        return (seed, playlists, owner, playlistId);
    }

    private static async Task<Track> TrackAsync(Seed seed, string owner, int duration) =>
        (await seed.Tracks.GetTrackAsync(await seed.TrackAsync(owner, duration)))!;

    [Fact]
    public async Task ContainingTrack_IsOnlyTheirOwnCustomPlaylistsHoldingIt()
    {
        var (seed, playlists, owner, withIt) = await ArrangeAsync();
        var track = await TrackAsync(seed, owner, 120);
        var withoutIt = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(withoutIt, owner, "Other", null, null);
        await playlists.AddTrackAsync(owner, withIt, track);
        await seed.Likes.LikeTrackAsync(track.Id, owner, owner, track.Duration); // in Liked tracks too, which doesn't count

        var someoneElse = await seed.UserAsync();
        var theirs = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(theirs, someoneElse, "Theirs", null, null);
        await playlists.AddTrackAsync(someoneElse, theirs, track);

        (await playlists.GetPlaylistsContainingTrackAsync(owner, track.Id)).Select(p => p.Id).Should().Equal(withIt);
        (await playlists.GetPlaylistsContainingTrackAsync(await seed.UserAsync(), track.Id)).Should().BeEmpty();
    }

    [Fact]
    public async Task ConcurrentDoubleAddAndRemove_MoveTheCountersOnce()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        var track = await TrackAsync(seed, owner, 150);

        var added = await Task.WhenAll(
            playlists.AddTrackAsync(owner, playlistId, track),
            playlists.AddTrackAsync(owner, playlistId, track));
        added.Should().ContainSingle(a => a);
        var afterAdd = (await seed.PlaylistItemAsync(owner, playlistId))!;
        (afterAdd.TrackCount, afterAdd.TotalDurationSeconds).Should().Be((1, 150));

        var removed = await Task.WhenAll(
            playlists.RemoveTrackAsync(owner, playlistId, track.Id),
            playlists.RemoveTrackAsync(owner, playlistId, track.Id));
        removed.Should().ContainSingle(r => r);
        var afterRemove = (await seed.PlaylistItemAsync(owner, playlistId))!;
        (afterRemove.TrackCount, afterRemove.TotalDurationSeconds).Should().Be((0, 0));
    }

    [Fact]
    public async Task Adds_AppendInOrder_ReAddIsANoOpKeepingPositionAndAddedAt()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        var first = await TrackAsync(seed, owner, 10);
        var second = await TrackAsync(seed, owner, 20);

        (await playlists.AddTrackAsync(owner, playlistId, first)).Should().BeTrue();
        (await playlists.AddTrackAsync(owner, playlistId, second)).Should().BeTrue();
        var addedAt = (await playlists.GetPlaylistTracksAsync(playlistId, owner, 10, null)).Items[0].AddedAt;

        await Task.Delay(5);
        (await playlists.AddTrackAsync(owner, playlistId, first)).Should().BeFalse();

        var entries = (await playlists.GetPlaylistTracksAsync(playlistId, owner, 10, null)).Items;
        entries.Select(e => e.TrackId).Should().Equal(first.Id, second.Id);
        entries[0].AddedAt.Should().Be(addedAt);
        (await seed.PlaylistItemAsync(owner, playlistId))!.TrackCount.Should().Be(2);
    }

    [Fact]
    public async Task RemoveOfANonMember_IsANoOp()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();

        (await playlists.RemoveTrackAsync(owner, playlistId, Guid.NewGuid().ToString("N"))).Should().BeFalse();
        (await seed.PlaylistItemAsync(owner, playlistId))!.TrackCount.Should().Be(0);
    }

    [Fact]
    public async Task SetTracks_Reorders_RemovesOmittedMembers_AndRecounts()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        var a = await TrackAsync(seed, owner, 10);
        var b = await TrackAsync(seed, owner, 20);
        var c = await TrackAsync(seed, owner, 40);
        foreach (var t in new[] { a, b, c })
            await playlists.AddTrackAsync(owner, playlistId, t);

        var removed = await playlists.SetTracksAsync(owner, playlistId, [c.Id, a.Id]);

        removed.Should().Be(1);
        (await playlists.GetPlaylistTracksAsync(playlistId, owner, 10, null)).Items.Select(e => e.TrackId).Should().Equal(c.Id, a.Id);
        var item = (await seed.PlaylistItemAsync(owner, playlistId))!;
        (item.TrackCount, item.TotalDurationSeconds).Should().Be((2, 50));
    }

    [Fact]
    public async Task SetTracks_RejectsTracksThatAreNotMembers()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        var member = await TrackAsync(seed, owner, 10);
        await playlists.AddTrackAsync(owner, playlistId, member);

        var stranger = Guid.NewGuid().ToString("N");
        var ex = (await FluentActions.Awaiting(() =>
            playlists.SetTracksAsync(owner, playlistId, [member.Id, stranger])).Should().ThrowAsync<ArgumentException>()).Which;
        ex.Message.Should().Contain(stranger);
        (await seed.PlaylistItemAsync(owner, playlistId))!.TrackCount.Should().Be(1);
    }

    [Fact]
    public async Task DeletedTrack_StaysAsADeletedPlaceholderWithItsName()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        var track = await TrackAsync(seed, owner, 75);
        await playlists.AddTrackAsync(owner, playlistId, track);

        await seed.Tracks.DeleteTrackAsync(owner, track.Id);

        var entry = (await playlists.GetPlaylistTracksAsync(playlistId, owner, 10, null)).Items.Should().ContainSingle().Subject;
        entry.Unavailable.Should().BeTrue();
        entry.Reason.Should().Be(PlaylistTrackReason.Deleted);
        (entry.Name, entry.Duration).Should().Be((track.TrackName, 75));
        entry.Track.Should().BeNull();
    }

    [Fact]
    public async Task Listing_PutsTheLikesPlaylistFirst_ThenNewestCustom()
    {
        var (seed, playlists, owner, olderCustom) = await ArrangeAsync();
        await Task.Delay(5);
        var newerCustom = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(newerCustom, owner, "Newer", null, null);

        var ids = (await playlists.GetPlaylistsAsync(owner, 10, null)).Items.Select(p => p.Id);
        ids.Should().Equal(PlaylistRepository.LikesPlaylistId, newerCustom, olderCustom);
    }

    [Fact]
    public async Task Update_ChangesName_BlankDescriptionRemovesIt()
    {
        var (_, playlists, owner, playlistId) = await ArrangeAsync();
        await playlists.UpdatePlaylistAsync(owner, playlistId, null, "late night", null, false);

        var updated = (await playlists.UpdatePlaylistAsync(owner, playlistId, "Renamed", " ", null, false))!;

        updated.Name.Should().Be("Renamed");
        updated.Description.Should().BeNull();
    }

    [Fact]
    public async Task Delete_RemovesThePlaylistAndItsMemberships()
    {
        var (seed, playlists, owner, playlistId) = await ArrangeAsync();
        await playlists.AddTrackAsync(owner, playlistId, await TrackAsync(seed, owner, 10));

        await playlists.DeletePlaylistAsync(owner, playlistId);

        (await playlists.GetPlaylistAsync(owner, playlistId)).Should().BeNull();
        (await playlists.GetPlaylistTracksAsync(playlistId, owner, 10, null)).Items.Should().BeEmpty();
    }
}
