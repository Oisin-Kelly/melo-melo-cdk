using Domain;
using Ports.Services;

namespace Adapters.Repositories;

// Batch-loads user profiles for hydrating rows (likers, recipients, followers, feed senders,
// activity actors). Dedupes first — BatchGetItem rejects duplicate keys — and keys the result
// case-insensitively, since usernames arrive from records in their stored spelling.
internal static class ProfileLookup
{
    public static async Task<Dictionary<string, UserDataModel>> GetAsync(IDynamoDBService db,
        IEnumerable<string> usernames)
    {
        var keys = usernames
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(Keys.Profile)
            .ToList();
        if (keys.Count == 0)
            return new Dictionary<string, UserDataModel>(StringComparer.OrdinalIgnoreCase);

        return (await db.BatchGetAsync<UserDataModel>(keys))
            .ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);
    }

    // Summaries in the given order (deduped), dropping usernames whose profile no longer exists
    public static async Task<List<UserSummary>> GetSummariesInOrderAsync(IDynamoDBService db,
        IReadOnlyList<string> usernames)
    {
        var profiles = await GetAsync(db, usernames);
        return usernames
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(profiles.ContainsKey)
            .Select(u => UserSummary.From(profiles[u]))
            .ToList();
    }
}
