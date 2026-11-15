using Adapters.Events;
using Adapters.Services;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Amazon.Runtime;
using Domain;
using Ports.Services;
using StreamsClient = Amazon.DynamoDBStreams.AmazonDynamoDBStreamsClient;
using StreamsConfig = Amazon.DynamoDBStreams.AmazonDynamoDBStreamsConfig;
using StreamsModel = Amazon.DynamoDBStreams.Model;
using StreamRecord = Amazon.DynamoDBStreams.Model.Record;
using StreamValue = Amazon.DynamoDBStreams.Model.AttributeValue;

namespace Adapters.Tests.Repositories;

// Repository tests run the real DynamoDBService against Amazon's DynamoDB Local, so they
// prove what DynamoDB actually does with the conditions/counters — not just what we asked for.
//
//   docker run -d -p 8000:8000 amazon/dynamodb-local
//
// Endpoint: DYNAMODB_LOCAL_URL (default http://localhost:8000). When it isn't reachable these
// tests are SKIPPED, unless REQUIRE_DYNAMODB_LOCAL=1 (CI), where that's a failure instead.
//
// Caveat: DynamoDB Local may serialise transactions rather than raise TransactionConflict, so
// the concurrent tests prove the condition guards (the outcome), not the conflict-retry path.
public sealed class DynamoDbLocalFixture : IAsyncLifetime
{
    private readonly string _tableName = $"melo-unit-{Guid.NewGuid():N}";
    private AmazonDynamoDBClient? _client;
    private StreamsClient? _streams;
    private string? _streamArn;
    // Where each shard of the table's stream has been read up to (null: the shard is closed)
    private readonly Dictionary<string, string?> _shardIterators = new();
    private IDynamoDBService? _service;
    private string? _unavailableReason;

    // Any access skips the calling test when DynamoDB Local isn't running
    public IDynamoDBService Db
    {
        get
        {
            if (_unavailableReason is not null) Assert.Skip(_unavailableReason);
            return _service!;
        }
    }

    public async ValueTask InitializeAsync()
    {
        var url = Environment.GetEnvironmentVariable("DYNAMODB_LOCAL_URL") ?? "http://localhost:8000";
        _client = new AmazonDynamoDBClient(new BasicAWSCredentials("local", "local"), new AmazonDynamoDBConfig
        {
            ServiceURL = url,
            AuthenticationRegion = "eu-west-1",
            Timeout = TimeSpan.FromSeconds(5),
            MaxErrorRetry = 0,
        });

        _streams = new StreamsClient(new BasicAWSCredentials("local", "local"),
            new StreamsConfig
            {
                ServiceURL = url,
                AuthenticationRegion = "eu-west-1",
                Timeout = TimeSpan.FromSeconds(5),
                MaxErrorRetry = 0,
            });

        try
        {
            await CreateTableAsync(_client);
        }
        catch (Exception e) when (e is AmazonServiceException or HttpRequestException or TaskCanceledException
                                      or OperationCanceledException)
        {
            if (Environment.GetEnvironmentVariable("REQUIRE_DYNAMODB_LOCAL") == "1")
                throw new InvalidOperationException($"DynamoDB Local is required but unreachable at {url}", e);

            _unavailableReason = $"DynamoDB Local not reachable at {url} — `docker run -d -p 8000:8000 amazon/dynamodb-local`";
            return;
        }

        _service = new DynamoDBService(_client, _tableName);
    }

    public async ValueTask DisposeAsync()
    {
        if (_client is null) return;
        if (_service is not null)
            await _client.DeleteTableAsync(_tableName);
        _client.Dispose();
        _streams?.Dispose();
    }

    /// What production's stream consumer (TableEventsLambda) does after a write, done now:
    /// every change on the table's stream since the last call, in order, through the real
    /// handlers (today ActivityEvents). Call it after the writes and before reading anything
    /// they derive, e.g. GET /activity.
    public async Task ProcessStreamAsync()
    {
        var handler = new ActivityEvents(Db);
        var shards = (await _streams!.DescribeStreamAsync(new StreamsModel.DescribeStreamRequest { StreamArn = _streamArn })).StreamDescription.Shards;
        foreach (var shard in shards)
        {
            if (!_shardIterators.TryGetValue(shard.ShardId, out var iterator))
                iterator = (await _streams.GetShardIteratorAsync(new StreamsModel.GetShardIteratorRequest
                {
                    StreamArn = _streamArn,
                    ShardId = shard.ShardId,
                    ShardIteratorType = Amazon.DynamoDBStreams.ShardIteratorType.TRIM_HORIZON,
                })).ShardIterator;

            while (iterator is not null)
            {
                var page = await _streams.GetRecordsAsync(new StreamsModel.GetRecordsRequest { ShardIterator = iterator });
                foreach (var record in page.Records ?? [])
                    await handler.HandleAsync(ToChange(record));
                iterator = page.NextShardIterator;
                if (page.Records is not { Count: > 0 })
                    break; // caught up on an open shard
            }
            _shardIterators[shard.ShardId] = iterator;
        }
    }

    // The same flattening TableEventsLambda does to a Lambda stream event
    private static TableChange ToChange(StreamRecord record) => new(
        record.EventName.Value switch
        {
            "INSERT" => TableChangeKind.Insert,
            "MODIFY" => TableChangeKind.Modify,
            _ => TableChangeKind.Remove,
        },
        Flatten(record.Dynamodb.Keys)!,
        Flatten(record.Dynamodb.NewImage),
        Flatten(record.Dynamodb.OldImage),
        record.UserIdentity is { Type: "Service", PrincipalId: "dynamodb.amazonaws.com" });

    private static Dictionary<string, string>? Flatten(Dictionary<string, StreamValue>? image) =>
        image is not { Count: > 0 }
            ? null
            : image.Where(kv => kv.Value.S is not null || kv.Value.N is not null)
                .ToDictionary(kv => kv.Key, kv => (kv.Value.S ?? kv.Value.N)!);

    // Mirrors infra/DataStack.cs: PK/SK, GSI1 (GSI1PK/GSI1SK), GSI2 (GSI1PK/GSI2SK — shared
    // hash key), GSI3 (GSI3PK/GSI3SK), all projecting ALL
    private async Task CreateTableAsync(IAmazonDynamoDB client)
    {
        static KeySchemaElement Key(string name, KeyType type) => new(name, type);
        static GlobalSecondaryIndex Gsi(string name, string hash, string range) => new()
        {
            IndexName = name,
            KeySchema = [Key(hash, KeyType.HASH), Key(range, KeyType.RANGE)],
            Projection = new Projection { ProjectionType = ProjectionType.ALL },
        };

        var created = await client.CreateTableAsync(new CreateTableRequest
        {
            StreamSpecification = new StreamSpecification
            {
                StreamEnabled = true,
                StreamViewType = StreamViewType.NEW_AND_OLD_IMAGES,
            },
            TableName = _tableName,
            BillingMode = BillingMode.PAY_PER_REQUEST,
            AttributeDefinitions = new[] { "PK", "SK", "GSI1PK", "GSI1SK", "GSI2SK", "GSI3PK", "GSI3SK" }
                .Select(a => new AttributeDefinition(a, ScalarAttributeType.S))
                .ToList(),
            KeySchema = [Key("PK", KeyType.HASH), Key("SK", KeyType.RANGE)],
            GlobalSecondaryIndexes =
            [
                Gsi("GSI1", "GSI1PK", "GSI1SK"),
                Gsi("GSI2", "GSI1PK", "GSI2SK"),
                Gsi("GSI3", "GSI3PK", "GSI3SK"),
            ],
        });
        _streamArn = created.TableDescription.LatestStreamArn;
    }
}
