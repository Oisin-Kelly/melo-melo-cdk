using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;

namespace Lambda.Tests.Handlers;

public class SuggestionHandlerTests
{
    private const string Me = "alice";

    private readonly ISuggestionRepository _suggestions = Substitute.For<ISuggestionRepository>();
    private readonly TestLambdaContext _context = new();

    private GetSuggestedUsersLambda.Function Get => new(_suggestions);
    private HideSuggestionLambda.Function Hide => new(_suggestions);

    [Fact]
    public async Task Get_WithoutIdentity_Is401()
    {
        (await Get.FunctionHandler(Http.Anonymous(), _context)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await _suggestions.DidNotReceiveWithAnyArgs().GetSuggestionsAsync(default!, default);
    }

    [Fact]
    public async Task Get_ReturnsUpTo20_WithReasonAndMutuals()
    {
        _suggestions.GetSuggestionsAsync(Me, 20).Returns([
            new SuggestedUser
            {
                User = Fakes.Summary("carol"), Reason = SuggestionReason.Mutuals,
                Mutuals = [Fakes.Summary("bob")], MutualCount = 3,
            },
        ]);

        var item = (await Get.FunctionHandler(Http.As(Me), _context))
            .ShouldHaveStatus(HttpStatusCode.OK).Json().GetProperty("items")[0];

        item.GetProperty("user").GetProperty("username").GetString().Should().Be("carol");
        item.GetProperty("reason").GetString().Should().Be("MUTUALS");
        item.GetProperty("mutuals")[0].GetProperty("username").GetString().Should().Be("bob");
        item.GetProperty("mutualCount").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Get_RepositoryFailure_Is500()
    {
        _suggestions.GetSuggestionsAsync(Me, 20).ThrowsAsync(new InvalidOperationException("secret detail"));
        var response = await Get.FunctionHandler(Http.As(Me), _context);
        response.ShouldHaveStatus(HttpStatusCode.InternalServerError);
        response.Body.Should().NotContain("secret detail");
    }

    [Fact]
    public async Task Hide_NormalisesTheName_AndHidesIt()
    {
        (await Hide.FunctionHandler(Http.As(Me), _context, "Carol")).ShouldHaveStatus(HttpStatusCode.OK);
        await _suggestions.Received(1).HideAsync(Me, "carol");
    }

    [Fact]
    public async Task Hide_Yourself_Is400_AndAnonymousIs401()
    {
        (await Hide.FunctionHandler(Http.As(Me), _context, "ALICE")).ShouldHaveStatus(HttpStatusCode.BadRequest);
        (await Hide.FunctionHandler(Http.Anonymous(), _context, "carol")).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        await _suggestions.DidNotReceiveWithAnyArgs().HideAsync(default!, default!);
    }
}
