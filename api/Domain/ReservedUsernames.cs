using System.Text.RegularExpressions;

namespace Domain;

// Profiles live at the site root (/{username}), so a username must never be a top-level app path,
// a static file the CDN or service worker serves, or a word the app may want later — adding one
// after signup strands the user who already has it. Mirrored in web/src/features/auth/utils/validation.ts.
public static partial class ReservedUsernames
{
    public static readonly HashSet<string> Words =
    [
        // Current top-level routes (incl. auth + legacy redirects)
        "login", "signup", "verify", "forgot-password", "search", "library", "liked", "activity",
        "settings", "upload", "u", "tracks", "albums", "playlists",
        // Static hosting
        "assets", "static", "public", "index", "favicon", "manifest", "sw", "robots", "sitemap",
        // Likely future paths
        "about", "help", "support", "terms", "privacy", "legal", "contact", "admin", "api", "app",
        "me", "new", "home", "feed", "explore", "discover", "notifications", "messages", "inbox",
        "logout", "signin", "sign-in", "sign-up", "register", "account", "profile", "user", "users",
        "share", "shared", "melomelo", "www", "mail", "blog", "status", "docs", "dev", "test",
        // API paths that sit beside /users/{username} (a user by that name would be unreachable)
        "suggestions",
    ];

    // A dotted name ending in a web file extension (sw.js, robots.txt, index.html) would be served
    // by CloudFront/the service worker instead of the profile; ordinary dotted names (oisin.kelly) are fine
    [GeneratedRegex(@"\.(js|mjs|css|html|htm|json|txt|xml|svg|png|jpg|jpeg|gif|ico|webp|webmanifest|map|woff|woff2|ttf|mp3|m4a|mp4|pdf|zip)$")]
    private static partial Regex FileExtension();

    public static bool IsReserved(string username)
    {
        var lower = username.ToLowerInvariant();
        return Words.Contains(lower) || FileExtension().IsMatch(lower);
    }
}
