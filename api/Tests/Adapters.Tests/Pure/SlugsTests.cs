using Domain;

namespace Adapters.Tests.Pure;

public class SlugsTests
{
    [Theory]
    [InlineData("My Private Playlist", "my-private-playlist")]
    [InlineData("  Café del Mar (Live)! ", "cafe-del-mar-live")]
    [InlineData("Don't Stop -- Me   Now", "don-t-stop-me-now")]
    [InlineData("Track 01", "track-01")]
    [InlineData("Straße Björk Œuvre", "strasse-bjork-oeuvre")]
    public void FromTitle_LowercasesStripsAccentsAndDashesTheRest(string title, string expected)
    {
        Slugs.FromTitle(title, SlugKind.Track).Should().Be(expected);
    }

    [Theory]
    [InlineData("🎵🎶", SlugKind.Track, "track")]
    [InlineData("音楽", SlugKind.Album, "album")]
    [InlineData("!!!", SlugKind.Playlist, "playlist")]
    public void FromTitle_FallsBackToTheKindWordWhenNothingIsLeft(string title, string kind, string expected)
    {
        Slugs.FromTitle(title, kind).Should().Be(expected);
    }

    [Fact]
    public void FromTitle_CutsLongTitlesAtAWordBoundary_LeavingRoomForASuffix()
    {
        var title = string.Join(" ", Enumerable.Repeat("words", 30)); // 179 chars

        var slug = Slugs.FromTitle(title, SlugKind.Track);

        slug.Length.Should().BeLessThanOrEqualTo(50);
        slug.Should().NotEndWith("-").And.EndWith("words");
        Slugs.Candidate(slug, 999).Length.Should().BeLessThanOrEqualTo(Slugs.MaxLength);
    }

    [Fact]
    public void Candidate_NumbersFromTwo()
    {
        Slugs.Candidate("my-song", 1).Should().Be("my-song");
        Slugs.Candidate("my-song", 2).Should().Be("my-song-2");
    }

    [Fact]
    public void ReservedWords_OnlyApplyToTracks()
    {
        Slugs.IsReserved("followers", SlugKind.Track).Should().BeTrue();
        Slugs.IsReserved("followers", SlugKind.Album).Should().BeFalse();
    }

    [Theory]
    [InlineData("my-song", null)]
    [InlineData("a", null)]
    [InlineData("", "1–60")]
    [InlineData("My-Song", "lowercase")]
    [InlineData("my--song", "lowercase")]
    [InlineData("-my-song", "lowercase")]
    [InlineData("my_song", "lowercase")]
    [InlineData("albums", "reserved")]
    public void Validate_ChecksFormatLengthAndReservedWords(string slug, string? errorContains)
    {
        var error = Slugs.Validate(slug, SlugKind.Track);

        if (errorContains is null)
            error.Should().BeNull();
        else
            error.Should().Contain(errorContains);
    }

    [Fact]
    public void Validate_RejectsOverlongSlugs()
    {
        Slugs.Validate(new string('a', Slugs.MaxLength), SlugKind.Track).Should().BeNull();
        Slugs.Validate(new string('a', Slugs.MaxLength + 1), SlugKind.Track).Should().NotBeNull();
    }
}

public class ReservedUsernamesTests
{
    [Theory]
    [InlineData("library")]
    [InlineData("Settings")]
    [InlineData("assets")]
    [InlineData("sw.js")]
    [InlineData("robots.txt")]
    [InlineData("index.html")]
    [InlineData("favicon.svg")]
    [InlineData("manifest.webmanifest")]
    public void IsReserved_BlocksAppPathsAndStaticFiles(string username)
    {
        ReservedUsernames.IsReserved(username).Should().BeTrue();
    }

    [Theory]
    [InlineData("oisinkelly")]
    [InlineData("oisin.kelly")]
    [InlineData("dj.shadow")]
    [InlineData("library_fan")]
    public void IsReserved_AllowsOrdinaryNames(string username)
    {
        ReservedUsernames.IsReserved(username).Should().BeFalse();
    }
}
