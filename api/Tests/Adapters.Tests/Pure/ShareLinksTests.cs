using Domain;

namespace Adapters.Tests.Pure;

public class ShareLinksTests
{
    [Fact]
    public void NewToken_Is22UrlSafeCharacters_AndUnique()
    {
        var tokens = Enumerable.Range(0, 1000).Select(_ => ShareLinks.NewToken()).ToList();

        tokens.Should().OnlyContain(t => ShareLinks.IsWellFormed(t));
        tokens.Should().OnlyHaveUniqueItems();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("AbCdEfGhIjKlMnOpQrStU/")]
    [InlineData("AbCdEfGhIjKlMnOpQrStUvW")]
    public void IsWellFormed_RejectsAnythingElse(string? token)
    {
        ShareLinks.IsWellFormed(token).Should().BeFalse();
    }

    [Theory]
    [InlineData(null, 7 * 24)]
    [InlineData("24h", 24)]
    [InlineData("7d", 7 * 24)]
    [InlineData("30d", 30 * 24)]
    public void ExpiryFor_KnownOptions(string? option, int hours)
    {
        ShareLinks.ExpiryFor(option).Should().Be(TimeSpan.FromHours(hours));
    }

    [Fact]
    public void ExpiryFor_Unknown_IsNull() => ShareLinks.ExpiryFor("forever").Should().BeNull();

    [Fact]
    public void StateOf_RevokedWinsOverExpired()
    {
        var link = new ShareLinkDataModel
        {
            Pk = "p", Sk = "s", Gsi3Pk = "g", Gsi3Sk = "g", Token = "t", Owner = "o", Kind = ShareLinkKind.Track,
            TargetId = "t1", CreatedAt = 0, LinkExpiresAt = 1000, ExpiresAt = 0,
        };

        ShareLinks.StateOf(link, 999).Should().Be(ShareLinkState.Active);
        ShareLinks.StateOf(link, 1000).Should().Be(ShareLinkState.Expired);
        ShareLinks.StateOf(link with { RevokedAt = 5 }, 999).Should().Be(ShareLinkState.Revoked);
        ShareLinks.StateOf(link with { RevokedAt = 5 }, 2000).Should().Be(ShareLinkState.Revoked);
    }
}
