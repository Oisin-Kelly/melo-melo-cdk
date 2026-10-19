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
    [Fact]
    public void FollowActivityKey_IsDeterministic_SoUnfollowCanRebuildIt()
    {
        var item = ActivityItems.BuildFollow("bob", "alice", 1_700_000_000_000);

        item.Pk.Should().Be("ACTIVITY#bob");
        item.Sk.Should().Be(ActivityItems.FollowSk("alice", 1_700_000_000_000));
        item.Sk.Should().Be("DATE#1700000000000#FOLLOW#alice");
    }

    [Fact]
    public void ActivityItem_CreatedAtIsTheRelationshipTimestamp()
    {
        // GET /activity only shows a like/share row whose relationship likedAt/sharedAt equals
        // createdAt — Build must stamp exactly the `now` it was given
        const long now = 1_700_000_000_123;
        var item = ActivityItems.Build("owner", ActivityType.TrackLiked, "fan", FeedItemType.Track, "TRK1", now);

        item.CreatedAt.Should().Be(now);
        item.Sk.Should().StartWith($"DATE#{now}#");
        item.TargetId.Should().Be("trk1");

        var ttlDays = DateTimeOffset.FromUnixTimeSeconds(item.ExpiresAt) - DateTimeOffset.UtcNow;
        ttlDays.TotalDays.Should().BeInRange(89.9, 90.1);
    }

    [Fact]
    public void FeedItemKey_MatchesTheBuiltItem_SoUnshareIsAKeyedDelete()
    {
        var built = FeedItems.Build("bob", FeedItemType.Album, "ALB1", "alice", 42);
        var (pk, sk) = FeedItems.Key("bob", FeedItemType.Album, "alb1");

        (pk, sk).Should().Be((built.Pk, built.Sk));
    }
}
