using Domain;

namespace Adapters.Suggestions;

/// What we know about the people around a user, gathered from their follow and share records
public sealed record SuggestionSignals
{
    public required string Me { get; init; }
    /// People I follow (excluded) — newest first, as read
    public required IReadOnlySet<string> Following { get; init; }
    public required IReadOnlySet<string> Hidden { get; init; }
    public IReadOnlySet<string> FollowsMe { get; init; } = new HashSet<string>();
    public IReadOnlySet<string> SharedWithMe { get; init; } = new HashSet<string>();
    public IReadOnlySet<string> ISharedWith { get; init; } = new HashSet<string>();
    /// Candidate → the people I follow who follow them, in the order read
    public IReadOnlyDictionary<string, List<string>> FollowedByMyFollowing { get; init; } =
        new Dictionary<string, List<string>>();
}

public sealed record ScoredSuggestion(string Username, int Score, string Reason, IReadOnlyList<string> Mutuals);

/// People you may know, scored from signals you already have (docs/suggestions-design.md):
/// someone who follows you or has shared music with you is almost certainly someone you know;
/// you sharing with them, a little less; each person you follow who follows them adds a bit.
public static class SuggestionScoring
{
    public const int FollowsYouWeight = 10;
    public const int SharedWithYouWeight = 10;
    public const int YouSharedWeight = 6;
    public const int PerMutualWeight = 2;

    public static List<ScoredSuggestion> Score(SuggestionSignals signals, int limit)
    {
        var candidates = new HashSet<string>(signals.FollowsMe);
        candidates.UnionWith(signals.SharedWithMe);
        candidates.UnionWith(signals.ISharedWith);
        candidates.UnionWith(signals.FollowedByMyFollowing.Keys);
        candidates.Remove(signals.Me);
        candidates.ExceptWith(signals.Following);
        candidates.ExceptWith(signals.Hidden);

        return candidates
            .Select(username =>
            {
                var mutuals = signals.FollowedByMyFollowing.TryGetValue(username, out var m) ? m : [];
                var score = mutuals.Count * PerMutualWeight
                            + (signals.FollowsMe.Contains(username) ? FollowsYouWeight : 0)
                            + (signals.SharedWithMe.Contains(username) ? SharedWithYouWeight : 0)
                            + (signals.ISharedWith.Contains(username) ? YouSharedWeight : 0);
                // The strongest reason is the one shown
                var reason = signals.FollowsMe.Contains(username) ? SuggestionReason.FollowsYou
                    : signals.SharedWithMe.Contains(username) ? SuggestionReason.SharedWithYou
                    : signals.ISharedWith.Contains(username) ? SuggestionReason.YouShared
                    : SuggestionReason.Mutuals;
                return new ScoredSuggestion(username, score, reason, mutuals);
            })
            .OrderByDescending(s => s.Score)
            .ThenBy(s => s.Username, StringComparer.Ordinal) // stable between visits
            .Take(limit)
            .ToList();
    }
}
