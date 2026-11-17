using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

/// Why someone is suggested, strongest first — the client words it ("Follows you",
/// "Shared music with you", "You shared with them", "Followed by Anna and 2 others")
public static class SuggestionReason
{
    public const string FollowsYou = "FOLLOWS_YOU";
    public const string SharedWithYou = "SHARED_WITH_YOU";
    public const string YouShared = "YOU_SHARED";
    public const string Mutuals = "MUTUALS";
}

/// GET /users/suggestions: one person you may know. `mutuals` are up to two people you
/// follow who follow them (follow lists are public); `mutualCount` is how many in all.
/// Never explained by a share that isn't between you and them.
public record SuggestedUser
{
    [JsonPropertyName("user")] public required UserSummary User { get; set; }
    [JsonPropertyName("reason")] public required string Reason { get; set; }
    [JsonPropertyName("mutuals")] public required List<UserSummary> Mutuals { get; set; }
    [JsonPropertyName("mutualCount")] public required int MutualCount { get; set; }
}

public record SuggestionsResponse
{
    [JsonPropertyName("items")] public required List<SuggestedUser> Items { get; set; }
}

/// A suggestion the user dismissed (✕): USER#{me} / HIDE_SUGGESTION#{username}, so it
/// doesn't keep coming back; expires after 180 days.
public record HiddenSuggestionDataModel
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }
    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }
    [DynamoDBProperty("hiddenAt")] public required long HiddenAt { get; set; }
    [DynamoDBProperty("expiresAt")] public required long ExpiresAt { get; set; }

    [DynamoDBIgnore] public string Username => Sk.Replace("HIDE_SUGGESTION#", "");
}
