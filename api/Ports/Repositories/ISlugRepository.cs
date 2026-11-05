namespace Ports.Repositories;

// Readable-URL lookups. Claims, URL changes and cleanup happen inside the track/album/playlist
// repositories (each alongside its own meta item); this only answers "which item is this slug?".
public interface ISlugRepository
{
    // The id the slug points at — the item's current slug or one of its old, redirecting ones.
    // Null when no item ever had it. Says nothing about access: callers must check that first.
    public Task<string?> GetTargetIdAsync(string ownerUsername, string kind, string slug);
}
