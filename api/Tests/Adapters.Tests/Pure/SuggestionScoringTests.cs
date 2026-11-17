using Adapters.Suggestions;
using Domain;

namespace Adapters.Tests.Pure;

public class SuggestionScoringTests
{
    private static HashSet<string> Set(params string[] names) => [.. names];

    [Fact]
    public void Excludes_Me_PeopleIFollow_AndPeopleIDismissed()
    {
        var scored = SuggestionScoring.Score(new SuggestionSignals
        {
            Me = "me",
            Following = Set("friend"),
            Hidden = Set("dismissed"),
            FollowsMe = Set("me", "friend", "dismissed", "fan"),
        }, 10);

        scored.Select(s => s.Username).Should().Equal("fan");
    }

    [Fact]
    public void KnowingYou_OutranksMutuals_AndTheStrongestReasonIsShown()
    {
        var scored = SuggestionScoring.Score(new SuggestionSignals
        {
            Me = "me",
            Following = Set("anna", "ben"),
            Hidden = Set(),
            FollowsMe = Set("fan"),
            SharedWithMe = Set("sender", "fan"),
            ISharedWith = Set("listener"),
            FollowedByMyFollowing = new Dictionary<string, List<string>>
            {
                ["popular"] = ["anna", "ben"],
                ["listener"] = ["anna"],
            },
        }, 10);

        scored.Select(s => (s.Username, s.Reason)).Should().Equal(
            ("fan", SuggestionReason.FollowsYou),          // 10 + 10
            ("sender", SuggestionReason.SharedWithYou),    // 10
            ("listener", SuggestionReason.YouShared),      // 6 + 2
            ("popular", SuggestionReason.Mutuals));        // 2 + 2
        scored.Single(s => s.Username == "popular").Mutuals.Should().Equal("anna", "ben");
    }

    [Fact]
    public void KeepsTheTopN_InAStableOrder()
    {
        var signals = new SuggestionSignals
        {
            Me = "me",
            Following = Set(),
            Hidden = Set(),
            FollowsMe = Set("c", "a", "b"),
        };

        SuggestionScoring.Score(signals, 2).Select(s => s.Username).Should().Equal("a", "b");
    }
}
