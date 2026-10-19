using Amazon.DynamoDBv2.DataModel;
using Amazon.Lambda.CognitoEvents;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Services;
using Ports.Validation;

namespace Lambda.Tests.Handlers;

// Cognito triggers: a thrown exception is how a trigger fails the sign-up (Cognito shows its
// message), and returning the event lets it proceed.
public class AuthTriggerTests
{
    private readonly TestLambdaContext _context = new();

    // ---------------------------------------------------------------- PreSignUp: CheckEmailExistence

    private readonly IUserValidationService _validation = Substitute.For<IUserValidationService>();

    private static CognitoPreSignupEvent SignUp(string username, string? email) => new()
    {
        UserName = username,
        UserPoolId = "eu-west-1_pool",
        Request = new CognitoPreSignupRequest
        {
            UserAttributes = email is null ? new Dictionary<string, string>() : new Dictionary<string, string> { ["email"] = email },
        },
    };

    [Fact]
    public async Task PreSignUp_ValidUsernameAndUnusedEmail_LetsTheSignUpThrough()
    {
        var handler = new CheckEmailExistenceLambda.Function(_validation);
        var signUp = SignUp("alice", "alice@example.com");

        (await handler.FunctionHandler(signUp, _context)).Should().BeSameAs(signUp);
        _validation.Received(1).ValidateUsername("alice");
        await _validation.Received(1).ValidateEmail("alice@example.com", "eu-west-1_pool");
    }

    [Fact]
    public async Task PreSignUp_TakenEmail_FailsTheSignUp()
    {
        var handler = new CheckEmailExistenceLambda.Function(_validation);
        _validation.ValidateEmail("taken@example.com", "eu-west-1_pool")
            .ThrowsAsync(new InvalidOperationException("Email is already in use"));

        await FluentActions.Awaiting(() => handler.FunctionHandler(SignUp("alice", "taken@example.com"), _context))
            .Should().ThrowAsync<Exception>().WithMessage("*Email is already in use*");
    }

    [Fact]
    public async Task PreSignUp_InvalidUsername_FailsBeforeCheckingTheEmail()
    {
        var handler = new CheckEmailExistenceLambda.Function(_validation);
        _validation.When(v => v.ValidateUsername("a#b")).Throw(new ArgumentException("Username is invalid"));

        await FluentActions.Awaiting(() => handler.FunctionHandler(SignUp("a#b", "x@example.com"), _context))
            .Should().ThrowAsync<Exception>().WithMessage("*Username is invalid*");
        await _validation.DidNotReceiveWithAnyArgs().ValidateEmail(default!, default!);
    }

    [Fact]
    public async Task PreSignUp_MissingEmail_FailsTheSignUp()
    {
        var handler = new CheckEmailExistenceLambda.Function(_validation);

        await FluentActions.Awaiting(() => handler.FunctionHandler(SignUp("alice", null), _context))
            .Should().ThrowAsync<Exception>();
        _validation.DidNotReceiveWithAnyArgs().ValidateUsername(default!);
    }

    // ---------------------------------------------------------------- PostConfirmation

    private readonly IDynamoDBService _db = Substitute.For<IDynamoDBService>();
    private readonly ITransactWrite<UserDataModel> _profileTx = Substitute.For<ITransactWrite<UserDataModel>>();
    private readonly ITransactWrite<PlaylistDataModel> _likesTx = Substitute.For<ITransactWrite<PlaylistDataModel>>();

    private static CognitoPostConfirmationEvent Confirmed(string trigger, string? email = "Alice@Example.com") => new()
    {
        TriggerSource = trigger,
        UserName = "alice",
        Request = new CognitoPostConfirmationRequest
        {
            UserAttributes = email is null ? new Dictionary<string, string>() : new Dictionary<string, string> { ["email"] = email },
        },
    };

    [Fact]
    public async Task PostConfirmation_CreatesTheProfileAndLikesPlaylist_InOneTransaction()
    {
        _db.CreateTransactionPart<UserDataModel>().Returns(_profileTx);
        _db.CreateTransactionPart<PlaylistDataModel>().Returns(_likesTx);
        UserDataModel? profile = null;
        PlaylistDataModel? likes = null;
        _profileTx.AddSaveItem(Arg.Do<UserDataModel>(u => profile = u));
        _likesTx.AddSaveItem(Arg.Do<PlaylistDataModel>(p => likes = p));

        await new PostConfirmationLambda.Function(_db).FunctionHandler(Confirmed("PostConfirmation_ConfirmSignUp"), _context);

        await _db.Received(1).ExecuteTransactWriteAsync(_profileTx, _likesTx);
        (profile!.Pk, profile.Sk, profile.Username).Should().Be(("USER#alice", "PROFILE", "alice"));
        profile.Gsi1Pk.Should().Be("EMAIL#alice@example.com"); // email index is lowercased
        profile.Gsi3Sk.Should().Be("USERNAME#alice");           // searchable from day one
        profile.IncomingShares.Should().Be(IncomingSharesSetting.Everyone);
        (likes!.Sk, likes.Type).Should().Be(("PLAYLIST#likes", PlaylistType.Likes));
    }

    [Fact]
    public async Task PostConfirmation_SavesAMixedCaseSignUpLowercased_WithNoSecondSpelling()
    {
        _db.CreateTransactionPart<UserDataModel>().Returns(_profileTx);
        _db.CreateTransactionPart<PlaylistDataModel>().Returns(_likesTx);
        UserDataModel? profile = null;
        PlaylistDataModel? likes = null;
        _profileTx.AddSaveItem(Arg.Do<UserDataModel>(u => profile = u));
        _likesTx.AddSaveItem(Arg.Do<PlaylistDataModel>(p => likes = p));
        var signUp = Confirmed("PostConfirmation_ConfirmSignUp");
        signUp.UserName = "AliceSmith";

        await new PostConfirmationLambda.Function(_db).FunctionHandler(signUp, _context);

        (profile!.Pk, profile.Username, profile.DisplayName).Should().Be(("USER#alicesmith", "alicesmith", "alicesmith"));
        likes!.Pk.Should().Be("USER#alicesmith");
    }

    [Theory]
    [InlineData("PostConfirmation_ConfirmForgotPassword")] // a password reset isn't a new account
    public async Task PostConfirmation_OtherTriggerSources_WriteNothing(string trigger)
    {
        await new PostConfirmationLambda.Function(_db).FunctionHandler(Confirmed(trigger), _context);

        await _db.DidNotReceiveWithAnyArgs().ExecuteTransactWriteAsync(default!);
    }

    [Fact]
    public async Task PostConfirmation_WithoutAnEmail_FailsTheConfirmation()
    {
        await FluentActions.Awaiting(() =>
                new PostConfirmationLambda.Function(_db).FunctionHandler(Confirmed("PostConfirmation_ConfirmSignUp", email: null), _context))
            .Should().ThrowAsync<Exception>();
        await _db.DidNotReceiveWithAnyArgs().ExecuteTransactWriteAsync(default!);
    }
}
