using Domain;

namespace Adapters.Tests.Pure;

public class DropboxKeysTests
{
    [Fact]
    public void ForUser_PrefixesTheCallersUsername()
    {
        DropboxKeys.ForUser("alice", "staged/song.wav").Should().Be("alice/staged/song.wav");
    }

    [Theory]
    [InlineData("/staged/song.wav")]
    [InlineData("  staged/song.wav  ")]
    public void ForUser_TrimsLeadingSlashAndWhitespace(string clientKey)
    {
        DropboxKeys.ForUser("alice", clientKey).Should().Be("alice/staged/song.wav");
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("/")]
    public void ForUser_RejectsEmptyKeys(string clientKey)
    {
        FluentActions.Invoking(() => DropboxKeys.ForUser("alice", clientKey)).Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ForUser_RejectsOverlongKeys()
    {
        var atLimit = new string('k', DropboxKeys.MaxClientKeyLength);
        DropboxKeys.ForUser("alice", atLimit).Should().Be($"alice/{atLimit}");
        FluentActions.Invoking(() => DropboxKeys.ForUser("alice", atLimit + "k")).Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData("alice/staged/song.wav")]
    [InlineData("ALICE/staged/song.wav")]
    public void EnsureOwnedBy_AcceptsTheCallersPrefix_CaseInsensitively(string stagedKey)
    {
        DropboxKeys.EnsureOwnedBy(stagedKey, "alice");
    }

    [Theory]
    [InlineData("bob/staged/song.wav")]
    [InlineData("alice2/staged/song.wav")] // lookalike prefix — the trailing slash matters
    [InlineData("staged/alice/song.wav")]
    [InlineData("alice")]
    public void EnsureOwnedBy_RejectsKeysOutsideTheCallersPrefix(string stagedKey)
    {
        var ex = FluentActions.Invoking(() => DropboxKeys.EnsureOwnedBy(stagedKey, "alice")).Should().Throw<ArgumentException>().Which;
        ex.Message.Should().Contain("only use files you uploaded");
    }
}
