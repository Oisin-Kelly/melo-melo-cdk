using Adapters.Events;
using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Pure;

public class MembershipRankTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(10)]
    [InlineData(1234567)]
    public void SortKey_RoundTrips(int rank)
    {
        MembershipRank.FromSortKey(MembershipRank.ToSortKey(rank)).Should().Be(rank);
    }

    [Fact]
    public void SortKeys_SortAsStringsInRankOrder()
    {
        // DynamoDB sorts the GSI1SK lexicographically, so zero-padding must keep 90 before 100
        var keys = new[] { 100, 90, 1000, 10 }.Select(MembershipRank.ToSortKey).ToList();
        var sorted = keys.Order(StringComparer.Ordinal).Select(MembershipRank.FromSortKey);

        sorted.Should().Equal(10, 90, 100, 1000);
    }
}

public class ExpressionTests
{
    [Fact]
    public void UpdateExpressionBuilder_CombinesSetAndRemove()
    {
        var builder = new UpdateExpressionBuilder();
        builder.AddValue("trackName", "n", "Song");
        builder.AddNullableString("genre", "g", "   "); // blank → REMOVE
        var expression = builder.Build();

        expression.ExpressionStatement.Should().Be("SET #n = :n REMOVE #g");
        expression.ExpressionAttributeNames["#n"].Should().Be("trackName");
        expression.ExpressionAttributeNames["#g"].Should().Be("genre");
        expression.ExpressionAttributeValues[":n"].AsString().Should().Be("Song");
    }

    [Fact]
    public void CounterExpressions_AddsEveryDelta()
    {
        var expression = CounterExpressions.Add(("trackCount", 1), ("totalDurationSeconds", -300));

        expression.ExpressionStatement.Should().Be("ADD #c0 :c0, #c1 :c1");
        expression.ExpressionAttributeNames["#c0"].Should().Be("trackCount");
        expression.ExpressionAttributeValues[":c1"].AsLong().Should().Be(-300);
    }

    [Fact]
    public void ConditionPlaceholder_NeverCollidesWithGeneratedUpdatePlaceholders()
    {
        // The SDK merges the update and condition name maps, so a shared placeholder would
        // silently point one of them at the wrong attribute
        var condition = ConditionExpressions.ItemNotExists();
        var counter = CounterExpressions.Add(("a", 1), ("b", 1));

        condition.ExpressionStatement.Should().Be("attribute_not_exists(#condPk)");
        ConditionExpressions.ItemExists().ExpressionStatement.Should().Be("attribute_exists(#condPk)");
        condition.ExpressionAttributeNames.Keys.Intersect(counter.ExpressionAttributeNames.Keys).Should().BeEmpty();
        condition.ExpressionAttributeNames.Keys.Should().NotContain(k => k.StartsWith("#a"));
    }
}

public class ItemBuilderTests
{
    private static Dictionary<string, string> Keys(string pk, string sk) => new() { ["PK"] = pk, ["SK"] = sk };

    [Fact]
    public void ActivityRows_AreBuiltFromTheRecordAlone_WithDeterministicKeys()
    {
        // A like: to the track's owner, keyed by when and who
        var like = ActivityEvents.RowFor(Keys("TRACK#trk1", "LIKE#fan"),
            new Dictionary<string, string> { ["trackOwnerUsername"] = "owner", ["likedAt"] = "1700000000123" })!;
        (like.Pk, like.Sk, like.Type, like.ActorUsername, like.TargetId, like.CreatedAt).Should().Be((
            "ACTIVITY#owner", "DATE#1700000000123#LIKE#fan#TRACK#trk1", ActivityType.TrackLiked, "fan", "trk1",
            1_700_000_000_123L));

        // A share: to the recipient, from the owner
        var share = ActivityEvents.RowFor(Keys("ALBUM#alb1", "SHARED#bob"),
            new Dictionary<string, string> { ["albumOwnerUsername"] = "alice", ["sharedAt"] = "5" })!;
        (share.Pk, share.Sk, share.Type, share.ActorUsername).Should().Be((
            "ACTIVITY#bob", "DATE#5#SHARE#ALBUM#alb1", ActivityType.AlbumShared, "alice"));

        // A follow: the same key unfollow always rebuilt
        var follow = ActivityEvents.RowFor(Keys("FOLLOW#bob", "USER#alice"),
            new Dictionary<string, string> { ["createdAt"] = "1700000000000" })!;
        (follow.Pk, follow.Sk).Should().Be(("ACTIVITY#bob", ActivityItems.FollowSk("alice", 1_700_000_000_000)));
        follow.Sk.Should().Be("DATE#1700000000000#FOLLOW#alice");
    }

    [Fact]
    public void NoActivityRow_ForSelfLikes_ShareLinkAccepts_AlbumGrants_OrOtherRecords()
    {
        ActivityEvents.RowFor(Keys("TRACK#t", "LIKE#owner"),
            new Dictionary<string, string> { ["trackOwnerUsername"] = "owner", ["likedAt"] = "1" }).Should().BeNull();
        ActivityEvents.RowFor(Keys("TRACK#t", "SHARED#bob"),
            new Dictionary<string, string> { ["trackOwnerUsername"] = "alice", ["sharedAt"] = "1", ["via"] = ShareVia.Link })
            .Should().BeNull();
        ActivityEvents.RowFor(Keys("TRACK#t", "SHARED#bob#ALBUM#a"),
            new Dictionary<string, string> { ["trackOwnerUsername"] = "alice", ["grantedAt"] = "1" }).Should().BeNull();
        ActivityEvents.RowFor(Keys("USER#alice", "PROFILE"), new Dictionary<string, string>()).Should().BeNull();
        ActivityEvents.RowFor(Keys("PLAYLIST#p", "TRACK#t"), new Dictionary<string, string>()).Should().BeNull();
    }

    [Fact]
    public void FeedItemKey_MatchesTheBuiltItem_SoUnshareIsAKeyedDelete()
    {
        var built = FeedItems.Build("bob", FeedItemType.Album, "ALB1", "alice", 42);
        var (pk, sk) = FeedItems.Key("bob", FeedItemType.Album, "alb1");

        (pk, sk).Should().Be((built.Pk, built.Sk));
    }
}
