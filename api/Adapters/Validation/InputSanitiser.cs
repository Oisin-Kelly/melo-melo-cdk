using System.Text.RegularExpressions;

namespace Adapters.Validation;

public static partial class InputSanitiser
{
    [GeneratedRegex(@"[^\S\r\n]+", RegexOptions.Compiled)]
    private static partial Regex ExtraWhitespaceRegex();

    [GeneratedRegex(@"(\r?\n){3,}", RegexOptions.Compiled)]
    private static partial Regex ExtraNewLinesRegex();

    [GeneratedRegex(@"\r?\n", RegexOptions.Compiled)]
    private static partial Regex NewLineRegex();

    public static string? SingleLine(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var sanitised = NewLineRegex().Replace(input, " ");
        sanitised = ExtraWhitespaceRegex().Replace(sanitised.Trim(), " ");

        return string.IsNullOrEmpty(sanitised) ? null : sanitised;
    }

    public static string? MultiLine(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var sanitised = ExtraWhitespaceRegex().Replace(input.Trim(), " ");
        sanitised = ExtraNewLinesRegex().Replace(sanitised, Environment.NewLine + Environment.NewLine);

        return string.IsNullOrEmpty(sanitised) ? null : sanitised;
    }
}
