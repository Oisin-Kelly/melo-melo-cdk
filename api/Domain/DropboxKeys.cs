namespace Domain;

// Staged uploads live under the uploader's own prefix in the dropbox bucket:
// {username}/{clientKey}. The presign endpoint applies the prefix (clients can't
// choose another user's folder), and every consumer of a staged audioKey/imageKey
// checks it, so one user can neither overwrite nor reuse another user's upload.
public static class DropboxKeys
{
    public const int MaxClientKeyLength = 512;

    public static string ForUser(string username, string clientKey)
    {
        var key = clientKey.Trim().TrimStart('/');
        if (key.Length == 0 || key.Length > MaxClientKeyLength)
            throw new ArgumentException($"key must be 1–{MaxClientKeyLength} characters.");
        return $"{username}/{key}";
    }

    public static void EnsureOwnedBy(string stagedKey, string username)
    {
        if (!stagedKey.StartsWith($"{username}/", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("You can only use files you uploaded.");
    }
}
