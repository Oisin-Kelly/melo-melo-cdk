using Adapters.Validation;
using Domain;
using NSubstitute;
using Ports.Services;

namespace Adapters.Tests.Validation;

public class UserValidationServiceTests
{
    private readonly IUserPoolService _userPool = Substitute.For<IUserPoolService>();
    private UserValidationService Service => new(_userPool);

    private static User NewUser(Action<User>? configure = null)
    {
        var user = new User
        {
            Username = "alice",
            FollowingCount = 0,
            FollowerCount = 0,
            CreatedAt = 0,
        };
        configure?.Invoke(user);
        return user;
    }

    // --- Username (sign-up trigger) ---

    [Theory]
    [InlineData("al")]
    [InlineData("alice.smith_99")]
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123")] // exactly 30
    public void Username_ValidShapesPass(string username) => Service.ValidateUsername(username);

    [Theory]
    [InlineData("a")]                                // too short
    [InlineData("ABCDEFGHIJKLMNOPQRSTUVWXYZ01234")]  // 31
    [InlineData("alice smith")]                      // space
    [InlineData("alice/../bob")]                     // path-ish — usernames become key prefixes
    [InlineData("alice#bob")]                        // '#' is the key separator
    [InlineData("")]
    public void Username_InvalidShapesAreRejected(string username)
    {
        FluentActions.Invoking(() => Service.ValidateUsername(username)).Should().Throw<ArgumentException>();
    }

    // Profiles live at the site root (/{username}), so app paths and static file names are taken
    [Theory]
    [InlineData("library")]
    [InlineData("Settings")]
    [InlineData("sw.js")]
    [InlineData("robots.txt")]
    public void Username_ReservedNamesAreRejected(string username)
    {
        FluentActions.Invoking(() => Service.ValidateUsername(username)).Should().Throw<ArgumentException>()
            .WithMessage("That username isn't available");
    }

    // --- Email (sign-up trigger) ---

    [Fact]
    public async Task Email_ValidAndUnused_Passes()
    {
        _userPool.EmailExistsInUserPool("new@example.com", "pool").Returns(false);

        await Service.ValidateEmail("new@example.com", "pool");
    }

    [Fact]
    public async Task Email_AlreadyInThePool_IsRejected()
    {
        _userPool.EmailExistsInUserPool("taken@example.com", "pool").Returns(true);

        await FluentActions.Awaiting(() => Service.ValidateEmail("taken@example.com", "pool")).Should().ThrowAsync<InvalidOperationException>();
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("a@b")]
    [InlineData("")]
    public async Task Email_BadShape_IsRejectedWithoutAskingCognito(string email)
    {
        await FluentActions.Awaiting(() => Service.ValidateEmail(email, "pool")).Should().ThrowAsync<ArgumentException>();
        await _userPool.DidNotReceiveWithAnyArgs().EmailExistsInUserPool(default!, default!);
    }

    // --- Profile update ---

    [Fact]
    public async Task Profile_SanitisesEveryField()
    {
        var user = await Service.ValidateUser(NewUser(u =>
        {
            u.DisplayName = "  Alice   S ";
            u.Bio = "hi\n\n\n\nthere";
            u.City = " Dublin ";
            u.Country = "  ";
        }));

        (user.DisplayName, user.City).Should().Be(("Alice S", "Dublin"));
        user.Bio.Should().Be($"hi{Environment.NewLine}{Environment.NewLine}there");
        user.Country.Should().BeNull();
    }

    public static TheoryData<string, Action<User>> OverLimit => new()
    {
        { "displayName over 30", u => u.DisplayName = new string('d', 31) },
        { "bio over 2000", u => u.Bio = new string('b', 2001) },
        { "firstName over 35", u => u.FirstName = new string('f', 36) },
        { "lastName over 35", u => u.LastName = new string('l', 36) },
        { "city over 35", u => u.City = new string('c', 36) },
        { "country over 35", u => u.Country = new string('c', 36) },
    };

    [Theory]
    [MemberData(nameof(OverLimit))]
    public async Task Profile_EnforcesFieldLimits(string _, Action<User> breakIt)
    {
        await FluentActions.Awaiting(() => Service.ValidateUser(NewUser(breakIt))).Should().ThrowAsync<ArgumentException>();
    }

    [Theory]
    [InlineData(" following ", IncomingSharesSetting.Following)]
    [InlineData("none", IncomingSharesSetting.None)]
    [InlineData(null, null)] // omitted → leave the stored setting alone
    public async Task Profile_IncomingSharesIsNormalised(string? input, string? expected)
    {
        var user = await Service.ValidateUser(NewUser(u => u.IncomingShares = input));

        user.IncomingShares.Should().Be(expected);
    }

    [Fact]
    public async Task Profile_UnknownIncomingShares_IsRejected()
    {
        await FluentActions.Awaiting(() => Service.ValidateUser(NewUser(u => u.IncomingShares = "FRIENDS"))).Should().ThrowAsync<ArgumentException>();
    }
}
