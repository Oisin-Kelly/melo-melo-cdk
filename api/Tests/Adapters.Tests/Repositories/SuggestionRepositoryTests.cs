using Adapters.Repositories;
using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class SuggestionRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task SuggestsPeopleYouKnow_ButNotYouOrWhoYouFollow()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var suggestions = new SuggestionRepository(db);
        var (me, friend, friendOfFriend, sender, fan, listener) = (await seed.UserAsync(), await seed.UserAsync(),
            await seed.UserAsync(), await seed.UserAsync(), await seed.UserAsync(), await seed.UserAsync());

        await seed.Follows.FollowUser(friend, me);            // I follow friend
        await seed.Follows.FollowUser(friendOfFriend, friend); // friend follows friendOfFriend
        await seed.Follows.FollowUser(me, fan);                // fan follows me
        await seed.TrackAsync(sender, 120, me);                // sender shared a track with me
        await seed.TrackAsync(me, 120, listener);              // I shared a track with listener

        var items = await suggestions.GetSuggestionsAsync(me, 20);

        items.Select(s => (s.User.Username, s.Reason)).Should().BeEquivalentTo([
            (fan, SuggestionReason.FollowsYou),
            (sender, SuggestionReason.SharedWithYou),
            (listener, SuggestionReason.YouShared),
            (friendOfFriend, SuggestionReason.Mutuals),
        ]);
        var mutual = items.Single(s => s.User.Username == friendOfFriend);
        (mutual.MutualCount, mutual.Mutuals.Single().Username).Should().Be((1, friend));
    }

    [Fact]
    public async Task Hidden_IsNotSuggestedAgain()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var suggestions = new SuggestionRepository(db);
        var me = await seed.UserAsync();
        var fan = await seed.UserAsync();
        await seed.Follows.FollowUser(me, fan);

        (await suggestions.GetSuggestionsAsync(me, 20)).Select(s => s.User.Username).Should().Equal(fan);

        await suggestions.HideAsync(me, fan);
        (await suggestions.GetSuggestionsAsync(me, 20)).Should().BeEmpty();
    }

    [Fact]
    public async Task FollowingBack_RemovesThem()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var suggestions = new SuggestionRepository(db);
        var me = await seed.UserAsync();
        var fan = await seed.UserAsync();
        await seed.Follows.FollowUser(me, fan);
        await seed.Follows.FollowUser(fan, me);

        (await suggestions.GetSuggestionsAsync(me, 20)).Should().BeEmpty();
    }
}
