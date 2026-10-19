using System.Net;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Repositories;

namespace Lambda.Tests.Handlers;

public class FeedActivityHandlerTests
{
    private const string Me = "alice";

    private readonly IFeedRepository _feed = Substitute.For<IFeedRepository>();
    private readonly IActivityRepository _activity = Substitute.For<IActivityRepository>();
    private readonly TestLambdaContext _context = new();

    private GetFeedLambda.Function Feed => new(_feed);

    [Theory]
    [InlineData(null, null, null, false)]
    [InlineData("track", null, FeedItemType.Track, false)]   // type is case-insensitive
    [InlineData("ALBUM", "asc", FeedItemType.Album, true)]
    [InlineData(null, "DESC", null, false)]                  // anything but asc is newest-first
    public async Task Feed_ForwardsTypeAndSort_ForTheCaller(string? type, string? sort, string? expectedType, bool ascending)
    {
        var query = new Dictionary<string, string> { ["cursor"] = "c1" };
        if (type is not null) query["type"] = type;
        if (sort is not null) query["sort"] = sort;
        _feed.GetFeedAsync(Me, expectedType, ascending, 10, "c1").Returns(Fakes.Page<FeedEntry>());

        (await Feed.FunctionHandler(Http.As(Me, query), _context)).ShouldHaveStatus(HttpStatusCode.OK);
        await _feed.Received(1).GetFeedAsync(Me, expectedType, ascending, 10, "c1");
    }

    [Fact]
    public async Task Feed_UnknownType_Is400()
    {
        (await Feed.FunctionHandler(Http.As(Me, new() { ["type"] = "PLAYLIST" }), _context))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
        await _feed.DidNotReceiveWithAnyArgs().GetFeedAsync(default!, default, default, default, default);
    }

    [Fact]
    public async Task Feed_BadCursor_Is400()
    {
        _feed.GetFeedAsync(Me, null, false, 10, "garbage").ThrowsAsync(new ArgumentException("invalid pagination cursor"));

        (await Feed.FunctionHandler(Http.As(Me, new() { ["cursor"] = "garbage" }), _context))
            .ShouldHaveStatus(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Activity_PagesTwentyAtATime_ForTheCaller()
    {
        _activity.GetActivityAsync(Me, 20, "c1").Returns(Fakes.Page<ActivityEntry>());

        (await new GetActivityLambda.Function(_activity).FunctionHandler(Http.As(Me, new() { ["cursor"] = "c1" }), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _activity.Received(1).GetActivityAsync(Me, 20, "c1");
    }

    [Fact]
    public async Task MarkActivitySeen_StampsTheCaller()
    {
        (await new MarkActivitySeenLambda.Function(_activity).FunctionHandler(Http.As(Me), _context))
            .ShouldHaveStatus(HttpStatusCode.OK);
        await _activity.Received(1).MarkActivitySeenAsync(Me);
    }

    [Fact]
    public async Task WithoutIdentity_Is401()
    {
        (await Feed.FunctionHandler(Http.Anonymous(), _context)).ShouldHaveStatus(HttpStatusCode.Unauthorized);
        (await new GetActivityLambda.Function(_activity).FunctionHandler(Http.Anonymous(), _context))
            .ShouldHaveStatus(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task RepositoryFailure_Is500()
    {
        _activity.GetActivityAsync(Me, 20, null).ThrowsAsync(new InvalidOperationException("boom"));

        (await new GetActivityLambda.Function(_activity).FunctionHandler(Http.As(Me), _context))
            .ShouldHaveStatus(HttpStatusCode.InternalServerError);
    }
}
