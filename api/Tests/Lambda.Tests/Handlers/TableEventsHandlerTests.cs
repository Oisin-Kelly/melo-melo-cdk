using System.Text;
using Amazon.Lambda.DynamoDBEvents;
using Amazon.Lambda.Serialization.SystemTextJson;
using Domain;
using Lambda.Tests.Support;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Ports.Events;
using TableEventsLambda;

namespace Lambda.Tests.Handlers;

// TableEventsLambda: the stream event as Lambda delivers it, read through the same
// source-generated serializer the native build uses, flattened to TableChanges in order.
public class TableEventsHandlerTests
{
    private readonly ITableChangeHandler _handler = Substitute.For<ITableChangeHandler>();
    private readonly TestLambdaContext _context = new();

    // AWS's documented stream record shape: a like added, a share re-shared, a follow removed
    // by the app, and an activity row expired by TTL
    private const string Event = """
        {"Records":[
          {"eventID":"1","eventName":"INSERT","eventVersion":"1.1","eventSource":"aws:dynamodb","awsRegion":"eu-west-1",
           "dynamodb":{"ApproximateCreationDateTime":1794764160,
             "Keys":{"PK":{"S":"TRACK#t1"},"SK":{"S":"LIKE#bob"}},
             "NewImage":{"PK":{"S":"TRACK#t1"},"SK":{"S":"LIKE#bob"},"trackOwnerUsername":{"S":"alice"},
               "likedAt":{"N":"1794764160816"},"duration":{"N":"180"},"tags":{"M":{"x":{"S":"y"}}}},
             "SequenceNumber":"100","SizeBytes":120,"StreamViewType":"NEW_AND_OLD_IMAGES"},
           "eventSourceARN":"arn:aws:dynamodb:eu-west-1:1:table/t/stream/s"},
          {"eventID":"2","eventName":"MODIFY","eventVersion":"1.1","eventSource":"aws:dynamodb","awsRegion":"eu-west-1",
           "dynamodb":{"Keys":{"PK":{"S":"ALBUM#a1"},"SK":{"S":"SHARED#bob"}},
             "OldImage":{"albumOwnerUsername":{"S":"alice"},"sharedAt":{"N":"1"}},
             "NewImage":{"albumOwnerUsername":{"S":"alice"},"sharedAt":{"N":"2"},"caption":{"S":"hi"}},
             "SequenceNumber":"200","SizeBytes":90,"StreamViewType":"NEW_AND_OLD_IMAGES"}},
          {"eventID":"3","eventName":"REMOVE","eventVersion":"1.1","eventSource":"aws:dynamodb","awsRegion":"eu-west-1",
           "dynamodb":{"Keys":{"PK":{"S":"FOLLOW#alice"},"SK":{"S":"USER#bob"}},
             "OldImage":{"createdAt":{"N":"1794764160816"}},
             "SequenceNumber":"300","SizeBytes":50,"StreamViewType":"NEW_AND_OLD_IMAGES"}},
          {"eventID":"4","eventName":"REMOVE","eventVersion":"1.1","eventSource":"aws:dynamodb","awsRegion":"eu-west-1",
           "userIdentity":{"type":"Service","principalId":"dynamodb.amazonaws.com"},
           "dynamodb":{"Keys":{"PK":{"S":"ACTIVITY#alice"},"SK":{"S":"DATE#1#x"}},
             "OldImage":{"expiresAt":{"N":"5"}},
             "SequenceNumber":"400","SizeBytes":40,"StreamViewType":"NEW_AND_OLD_IMAGES"}}
        ]}
        """;

    private static DynamoDBEvent Deserialize()
    {
        var serializer = new SourceGeneratorLambdaJsonSerializer<TableEventsJsonContext>();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(Event));
        return serializer.Deserialize<DynamoDBEvent>(stream);
    }

    [Fact]
    public void TheRuntimeSerializer_ReadsKeysAndBothImages()
    {
        var records = Deserialize().Records;

        records.Should().HaveCount(4);
        records[0].Dynamodb.Keys["SK"].S.Should().Be("LIKE#bob");
        records[0].Dynamodb.NewImage["likedAt"].N.Should().Be("1794764160816");
        records[0].Dynamodb.NewImage["tags"].M["x"].S.Should().Be("y");
        records[1].Dynamodb.OldImage["sharedAt"].N.Should().Be("1");
        records[3].UserIdentity.PrincipalId.Should().Be("dynamodb.amazonaws.com");
    }

    [Fact]
    public async Task HandsEachChangeOn_InOrder_Flattened_WithTtlExpiriesMarked()
    {
        var seen = new List<TableChange>();
        _handler.HandleAsync(Arg.Do<TableChange>(seen.Add)).Returns(Task.CompletedTask);

        var response = await new Function(_handler).FunctionHandler(Deserialize(), _context);

        response.BatchItemFailures.Should().BeEmpty();
        seen.Select(c => c.Kind).Should().Equal(
            TableChangeKind.Insert, TableChangeKind.Modify, TableChangeKind.Remove, TableChangeKind.Remove);
        seen[0].Keys.Should().Contain("PK", "TRACK#t1");
        seen[0].NewImage!.Should().Contain("likedAt", "1794764160816").And.NotContainKey("tags");
        seen[1].OldImage!["sharedAt"].Should().Be("1");
        seen[2].NewImage.Should().BeNull();
        seen.Select(c => c.IsExpiry).Should().Equal(false, false, false, true);
    }

    [Fact]
    public async Task StopsAtTheFirstFailure_AndReportsThatRecord_SoLaterOnesWaitBehindIt()
    {
        _handler.HandleAsync(Arg.Is<TableChange>(c => c.Kind == TableChangeKind.Modify))
            .ThrowsAsync(new InvalidOperationException("boom"));

        var response = await new Function(_handler).FunctionHandler(Deserialize(), _context);

        response.BatchItemFailures.Should().ContainSingle().Which.ItemIdentifier.Should().Be("200");
        await _handler.Received(2).HandleAsync(Arg.Any<TableChange>()); // the like, then the failing share
    }
}
