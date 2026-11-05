using Domain;

namespace Adapters.Tests.Repositories;

[Collection(DynamoDbLocalCollection.Name)]
public class UserRepositoryTests(DynamoDbLocalFixture fixture)
{
    [Fact]
    public async Task ValidatedRecipients_DropSelfUnknownAndDuplicates()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var sender = await seed.UserAsync();
        var open = await seed.UserAsync();

        var recipients = await seed.Users.GetValidatedRecipientsAsync(
            [open, open, sender, Seed.NewName("ghost"), " "], sender);

        recipients.Should().Equal(open);
    }

    [Fact]
    public async Task ValidatedRecipients_TypedInAnyCasing_ResolveToTheLowercaseUsername()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var sender = await seed.UserAsync();
        var bob = await seed.UserAsync($"Bob{Guid.NewGuid():N}"[..16]); // stored lowercase
        var exact = await seed.UserAsync();

        var recipients = await seed.Users.GetValidatedRecipientsAsync(
            [bob.ToUpperInvariant(), $" {bob} ", exact, sender.ToUpperInvariant()], sender);

        // one recipient per user, in the stored (lowercase) spelling; the sender is still excluded
        recipients.Should().BeEquivalentTo([bob, exact]);
        bob.Should().Be(bob.ToLowerInvariant());
    }

    [Fact]
    public async Task ValidatedRecipients_CaseInsensitiveMatchStillHonoursIncomingShares()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var sender = await seed.UserAsync();
        var closed = await seed.UserAsync($"Nina{Guid.NewGuid():N}"[..16], IncomingSharesSetting.None);

        (await seed.Users.GetValidatedRecipientsAsync([closed.ToLowerInvariant()], sender)).Should().BeEmpty();
    }

    [Fact]
    public async Task ValidatedRecipients_HonourEachRecipientsIncomingSharesSetting()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var sender = await seed.UserAsync();
        var everyone = await seed.UserAsync();
        var nobody = await seed.UserAsync(incomingShares: IncomingSharesSetting.None);
        var followingOnly = await seed.UserAsync(incomingShares: IncomingSharesSetting.Following);
        var candidates = new List<string> { everyone, nobody, followingOnly };

        // FOLLOWING: the recipient must follow the sender
        (await seed.Users.GetValidatedRecipientsAsync(candidates, sender)).Should().Equal(everyone);

        await seed.Follows.FollowUser(followingOnly, sender); // wrong direction: sender follows recipient
        (await seed.Users.GetValidatedRecipientsAsync(candidates, sender)).Should().Equal(everyone);

        await seed.Follows.FollowUser(sender, followingOnly); // recipient follows sender
        var allowed = await seed.Users.GetValidatedRecipientsAsync(candidates, sender);
        allowed.Should().BeEquivalentTo(new[] { everyone, followingOnly }); // NONE never accepts
    }

    [Fact]
    public async Task Search_MatchesUsernamePrefixCaseInsensitively_Alphabetically()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var prefix = $"zq{Guid.NewGuid():N}"[..10];
        var bravo = await seed.UserAsync($"{prefix}Bravo");
        var alpha = await seed.UserAsync($"{prefix}alpha");
        await seed.UserAsync(Seed.NewName("other"));

        var results = (await seed.Users.SearchUsersAsync(prefix.ToUpperInvariant(), 10, null)).Items.Select(u => u.Username);

        results.Should().Equal(alpha, bravo);
    }

    [Fact]
    public async Task MarkSeen_RecordsWhen()
    {
        var db = fixture.Db;
        var seed = new Seed(db);
        var user = await seed.UserAsync();
        var before = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        await seed.Users.MarkSeenAsync(user);

        var (lastSeenAt, _) = await seed.Users.GetSeenMarkersAsync(user);
        lastSeenAt.Should().BeGreaterThanOrEqualTo(before);
    }
}
