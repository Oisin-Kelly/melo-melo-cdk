using Adapters.Validation;

namespace Adapters.Tests.Pure;

public class InputSanitiserTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n\t\n")]
    public void BlankInput_BecomesNull(string? input)
    {
        InputSanitiser.SingleLine(input).Should().BeNull();
        InputSanitiser.MultiLine(input).Should().BeNull();
    }

    [Fact]
    public void SingleLine_FoldsNewlinesAndCollapsesSpaces()
    {
        InputSanitiser.SingleLine("  Late   night\r\ndemo\n v2  ").Should().Be("Late night demo v2");
    }

    [Fact]
    public void MultiLine_KeepsSingleNewlines_CapsBlankLinesAtOne()
    {
        var nl = Environment.NewLine;
        var result = InputSanitiser.MultiLine("first   line\nsecond\n\n\n\n\nthird");

        result.Should().Be($"first line\nsecond{nl}{nl}third");
    }
}
