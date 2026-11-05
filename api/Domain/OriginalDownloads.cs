using System.Text;
using System.Text.RegularExpressions;

namespace Domain;

// Downloading a track's original upload (GET /tracks/{id}/original). The archived file keeps the
// upload's Content-Type but not its filename, so the download is named "{track name}.{ext}" with
// the extension worked out from the type, and S3 is told to serve it as an attachment.
public static partial class OriginalDownloads
{
    private const int MaxNameLength = 100;

    private static readonly Dictionary<string, string> Extensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["audio/mpeg"] = "mp3", ["audio/mp3"] = "mp3",
        ["audio/wav"] = "wav", ["audio/x-wav"] = "wav", ["audio/wave"] = "wav", ["audio/vnd.wave"] = "wav",
        ["audio/flac"] = "flac", ["audio/x-flac"] = "flac",
        ["audio/mp4"] = "m4a", ["audio/x-m4a"] = "m4a", ["audio/m4a"] = "m4a",
        ["audio/aac"] = "aac", ["audio/x-aac"] = "aac",
        ["audio/ogg"] = "ogg",
        ["audio/webm"] = "webm",
        ["audio/aiff"] = "aiff", ["audio/x-aiff"] = "aiff",
        ["audio/opus"] = "opus",
        ["audio/x-ms-wma"] = "wma",
        ["audio/amr"] = "amr",
        ["audio/3gpp"] = "3gp",
        ["audio/x-caf"] = "caf",
        ["audio/x-matroska"] = "mka",
    };

    // The type to file an upload under when the browser didn't give a usable one (it sends
    // application/octet-stream when it doesn't recognise a file, common for .flac/.aiff). The
    // staged key keeps the picked file's extension, so that decides it.
    private static readonly Dictionary<string, string> TypesByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        ["mp3"] = "audio/mpeg", ["wav"] = "audio/wav", ["flac"] = "audio/flac", ["m4a"] = "audio/mp4",
        ["aac"] = "audio/aac", ["ogg"] = "audio/ogg", ["oga"] = "audio/ogg", ["opus"] = "audio/opus",
        ["webm"] = "audio/webm", ["aiff"] = "audio/aiff", ["aif"] = "audio/aiff", ["wma"] = "audio/x-ms-wma",
        ["amr"] = "audio/amr", ["caf"] = "audio/x-caf", ["mka"] = "audio/x-matroska",
    };

    /// <summary>
    /// The audio Content-Type to process and archive an upload as: the uploaded type when it's one
    /// we can name a download after, else the one its file extension implies ("x.flac" sent as
    /// application/octet-stream → audio/flac), else the uploaded type if it's still audio/*.
    /// Null means it isn't audio.
    /// </summary>
    public static string? AudioContentType(string? uploadedType, string stagedKey)
    {
        if (ExtensionFor(uploadedType) is not null)
            return uploadedType;

        var dot = stagedKey.LastIndexOf('.');
        var fromExtension = dot >= 0 && dot > stagedKey.LastIndexOf('/')
            ? TypesByExtension.GetValueOrDefault(stagedKey[(dot + 1)..])
            : null;
        if (fromExtension is not null)
            return fromExtension;

        return uploadedType?.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) == true ? uploadedType : null;
    }

    /// <summary>The file extension for an audio Content-Type ("audio/mpeg" → "mp3"); null if unknown.</summary>
    public static string? ExtensionFor(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return null;
        var mediaType = contentType.Split(';')[0].Trim(); // drop parameters ("; codecs=…")
        return Extensions.GetValueOrDefault(mediaType);
    }

    // Characters no common filesystem allows, plus control characters
    [GeneratedRegex(@"[/\\:*?""<>|\p{Cc}]")]
    private static partial Regex IllegalChars();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>"Café del Mar" + audio/mpeg → "Café del Mar.mp3"; safe on any filesystem.</summary>
    public static string FileName(string trackName, string? contentType)
    {
        var name = Whitespace().Replace(IllegalChars().Replace(trackName, " "), " ").Trim().TrimEnd('.');
        if (name.Length > MaxNameLength)
            name = name[..MaxNameLength].TrimEnd();
        if (name.Length == 0)
            name = "track";

        var extension = ExtensionFor(contentType);
        return extension is null ? name : $"{name}.{extension}";
    }

    /// <summary>
    /// The Content-Disposition S3 should send: an attachment with a plain-ASCII fallback name for
    /// old clients and the exact UTF-8 name (RFC 5987) that current browsers use.
    /// </summary>
    public static string ContentDisposition(string fileName)
    {
        var ascii = new StringBuilder(fileName.Length);
        foreach (var c in fileName)
            ascii.Append(c is >= ' ' and <= '~' && c != '"' && c != '\\' ? c : '_');

        var utf8 = new StringBuilder();
        foreach (var b in Encoding.UTF8.GetBytes(fileName))
        {
            var c = (char)b;
            // RFC 5987 attr-char: ALPHA / DIGIT / "!#$&+-.^_`|~"
            if (char.IsAsciiLetterOrDigit(c) || "!#$&+-.^_`|~".Contains(c))
                utf8.Append(c);
            else
                utf8.Append('%').Append(b.ToString("X2"));
        }

        return $"attachment; filename=\"{ascii}\"; filename*=UTF-8''{utf8}";
    }
}

/// <summary>A ready-to-use download of a track's original upload.</summary>
public record OriginalDownload(string Url, string FileName, string? ContentType);
