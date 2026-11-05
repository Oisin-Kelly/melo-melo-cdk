using Adapters.Repositories;
using Domain;
using Ports.Services;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class SlugRepositoryTests(DynamoDbLocalFixture fixture)
{
    private async Task<string> TrackNamedAsync(Seed seed, string owner, string name)
    {
        var trackId = Guid.NewGuid().ToString("N");
        await seed.Tracks.CreateTrackAsync(trackId, new ProcessTrackInput
        {
            Username = owner,
            Name = name,
            AudioKey = $"{owner}/{trackId}.wav",
        }, new AudioProcessingResult(120), null);
        return trackId;
    }

    [Fact]
    public async Task Create_ClaimsASlugFromTheName_AndASecondSameNameGetsDashTwo()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var owner = await seed.UserAsync();

        var first = await TrackNamedAsync(seed, owner, "My Song");
        var second = await TrackNamedAsync(seed, owner, "My Song");

        (await seed.TrackItemAsync(owner, first))!.Slug.Should().Be("my-song");
        (await seed.TrackItemAsync(owner, second))!.Slug.Should().Be("my-song-2");
        (await slugs.GetTargetIdAsync(owner, SlugKind.Track, "my-song")).Should().Be(first);
        (await slugs.GetTargetIdAsync(owner, SlugKind.Track, "my-song-2")).Should().Be(second);
    }

    [Fact]
    public async Task Slugs_AreUniquePerOwnerAndPerKind()
    {
        var seed = new Seed(fixture.Db);
        var alice = await seed.UserAsync();
        var bob = await seed.UserAsync();
        var playlists = new PlaylistRepository(fixture.Db);

        var alicesTrack = await TrackNamedAsync(seed, alice, "Demo");
        var bobsTrack = await TrackNamedAsync(seed, bob, "Demo");
        var alicesPlaylist = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(alicesPlaylist, alice, "Demo", null, null);

        (await seed.TrackItemAsync(alice, alicesTrack))!.Slug.Should().Be("demo");
        (await seed.TrackItemAsync(bob, bobsTrack))!.Slug.Should().Be("demo");
        (await seed.PlaylistItemAsync(alice, alicesPlaylist))!.Slug.Should().Be("demo");
    }

    [Fact]
    public async Task ReservedTrackSlugs_AreSkipped()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();

        var trackId = await TrackNamedAsync(seed, owner, "Followers");

        (await seed.TrackItemAsync(owner, trackId))!.Slug.Should().Be("followers-2");
    }

    [Fact]
    public async Task ReClaimingForTheSameTarget_ReusesItsSlug()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();
        var trackId = Guid.NewGuid().ToString("N");

        // A retried ProcessTrack execution claims again for the same track
        var first = await SlugRecords.ClaimAsync(fixture.Db, owner, SlugKind.Track, trackId, "Retry Me");
        var again = await SlugRecords.ClaimAsync(fixture.Db, owner, SlugKind.Track, trackId, "Retry Me");

        (first, again).Should().Be(("retry-me", "retry-me"));
    }

    [Fact]
    public async Task ChangingTheUrl_KeepsTheOldSlugResolving_AndRenamingLeavesTheUrlAlone()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var owner = await seed.UserAsync();
        var trackId = await TrackNamedAsync(seed, owner, "Old Name");

        var renamed = await seed.Tracks.UpdateTrackAsync(owner, trackId, "New Name", null, null, null, false);
        renamed!.Slug.Should().Be("old-name");

        var moved = await seed.Tracks.UpdateTrackAsync(owner, trackId, "New Name", null, null, null, false,
            "new-url");
        moved!.Slug.Should().Be("new-url");
        (await slugs.GetTargetIdAsync(owner, SlugKind.Track, "new-url")).Should().Be(trackId);
        (await slugs.GetTargetIdAsync(owner, SlugKind.Track, "old-name")).Should().Be(trackId);

        // Moving back to one of its own old slugs is allowed
        var back = await seed.Tracks.UpdateTrackAsync(owner, trackId, "New Name", null, null, null, false,
            "old-name");
        back!.Slug.Should().Be("old-name");
    }

    [Fact]
    public async Task ChangingToASlugAnotherItemHolds_Fails_AndChangesNothing()
    {
        var seed = new Seed(fixture.Db);
        var owner = await seed.UserAsync();
        var albums = seed.Albums;
        var first = Guid.NewGuid().ToString("N");
        var second = Guid.NewGuid().ToString("N");
        await albums.CreateAlbumAsync(first, owner, "Summer", null, null, []);
        await albums.CreateAlbumAsync(second, owner, "Winter", null, null, []);

        var act = () => albums.UpdateAlbumAsync(owner, second, "Renamed", null, null, false, "summer");

        await act.Should().ThrowAsync<ArgumentException>().WithMessage(SlugRecords.TakenMessage);
        var unchanged = (await seed.AlbumItemAsync(owner, second))!;
        (unchanged.Name, unchanged.Slug).Should().Be(("Winter", "winter"));
    }

    // Races: two requests from the same account at the same moment. Slugs are per owner, so two
    // different accounts never contend at all (Slugs_AreUniquePerOwnerAndPerKind).

    [Fact]
    public async Task ConcurrentCreatesWithTheSameName_EachGetTheirOwnSlug()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var playlists = new PlaylistRepository(fixture.Db);
        var owner = await seed.UserAsync();
        var ids = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid().ToString("N")).ToList();

        var created = await Task.WhenAll(ids.Select(id => playlists.CreatePlaylistAsync(id, owner, "Road Trip", null, null)));

        var claimed = created.Select(p => p.Slug!).ToList();
        claimed.Should().OnlyHaveUniqueItems();
        claimed.Should().OnlyContain(s => s == "road-trip" || s.StartsWith("road-trip-"));
        foreach (var playlist in created)
            (await slugs.GetTargetIdAsync(owner, SlugKind.Playlist, playlist.Slug!)).Should().Be(playlist.Id);
    }

    [Fact]
    public async Task ConcurrentUrlChangesToTheSameSlug_ExactlyOneWins_TheOtherIsRefused()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var owner = await seed.UserAsync();
        var albums = seed.Albums;
        var first = Guid.NewGuid().ToString("N");
        var second = Guid.NewGuid().ToString("N");
        await albums.CreateAlbumAsync(first, owner, "First", null, null, []);
        await albums.CreateAlbumAsync(second, owner, "Second", null, null, []);

        var attempts = await Task.WhenAll(new[] { first, second }.Select(async id =>
        {
            try
            {
                await albums.UpdateAlbumAsync(owner, id, null, null, null, false, "contested");
                return true;
            }
            catch (ArgumentException e) when (e.Message == SlugRecords.TakenMessage)
            {
                return false;
            }
        }));

        attempts.Should().ContainSingle(won => won);
        var winner = attempts[0] ? first : second;
        var loser = attempts[0] ? second : first;
        (await slugs.GetTargetIdAsync(owner, SlugKind.Album, "contested")).Should().Be(winner);
        (await seed.AlbumItemAsync(owner, loser))!.Slug.Should().NotBe("contested"); // its update was cancelled whole
    }

    [Fact]
    public async Task Delete_RemovesCurrentAndOldSlugs_FreeingTheName()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var playlists = new PlaylistRepository(fixture.Db);
        var owner = await seed.UserAsync();
        var playlistId = Guid.NewGuid().ToString("N");
        await playlists.CreatePlaylistAsync(playlistId, owner, "Road Trip", null, null);
        await playlists.UpdatePlaylistAsync(owner, playlistId, null, null, null, false, "summer-road-trip");

        await playlists.DeletePlaylistAsync(owner, playlistId);

        (await slugs.GetTargetIdAsync(owner, SlugKind.Playlist, "road-trip")).Should().BeNull();
        (await slugs.GetTargetIdAsync(owner, SlugKind.Playlist, "summer-road-trip")).Should().BeNull();
        var reused = await playlists.CreatePlaylistAsync(Guid.NewGuid().ToString("N"), owner, "Road Trip", null, null);
        reused.Slug.Should().Be("road-trip");
    }

    [Fact]
    public async Task DeleteTrack_RemovesItsSlugs()
    {
        var seed = new Seed(fixture.Db);
        var slugs = new SlugRepository(fixture.Db);
        var owner = await seed.UserAsync();
        var trackId = await TrackNamedAsync(seed, owner, "Gone Soon");

        await seed.Tracks.DeleteTrackAsync(owner, trackId);

        (await slugs.GetTargetIdAsync(owner, SlugKind.Track, "gone-soon")).Should().BeNull();
    }
}
