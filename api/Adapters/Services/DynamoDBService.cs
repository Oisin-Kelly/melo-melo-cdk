using System.Diagnostics.CodeAnalysis;
using System.Text;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using Ports.Services;

namespace Adapters.Services;

// ReSharper disable once InconsistentNaming
public sealed class DynamoDBService : IDynamoDBService
{
    private readonly IAmazonDynamoDB _client;
    private readonly DynamoDBContext _dbContext;
    private readonly string _tableName;

    public DynamoDBService(IAmazonDynamoDB dynamoDbClient, string tableName)
    {
        _client = dynamoDbClient;
        _dbContext = new DynamoDBContextBuilder()
            .WithDynamoDBClient(() => dynamoDbClient)
            .Build();

        _tableName = tableName;

        _dbContext.RegisterTableDefinition(new TableBuilder(dynamoDbClient, tableName)
            .AddHashKey("PK", DynamoDBEntryType.String)
            .AddRangeKey("SK", DynamoDBEntryType.String)
            .AddGlobalSecondaryIndex("GSI1", "GSI1PK", DynamoDBEntryType.String, "GSI1SK", DynamoDBEntryType.String)
            .AddGlobalSecondaryIndex("GSI2", "GSI1PK", DynamoDBEntryType.String, "GSI2SK", DynamoDBEntryType.String)
            .AddGlobalSecondaryIndex("GSI3", "GSI3PK", DynamoDBEntryType.String, "GSI3SK", DynamoDBEntryType.String)
            .Build());
    }

    public Task WriteToDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(T value)
    {
        return _dbContext.SaveAsync(value, new SaveConfig()
        {
            OverrideTableName = _tableName
        });
    }

    public async Task<T?> GetFromDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string pk, string sk)
    {
        return await _dbContext.LoadAsync<T>(pk, sk, new LoadConfig()
        {
            OverrideTableName = _tableName,
            ConsistentRead = true
        });
    }

    public Task<List<T>> QueryAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string hashKey,
        string? rangeKey = null,
        QueryOperator queryOperator = QueryOperator.Equal,
        string? indexName = null)
    {
        var queryConfig = new QueryConfig()
        {
            IndexName = indexName,
            OverrideTableName = _tableName,
            ConsistentRead = indexName == null
        };

        IAsyncSearch<T> search;

        if (rangeKey == null)
        {
            search = _dbContext.QueryAsync<T>(hashKey, queryConfig);
        }
        else
        {
            search = _dbContext.QueryAsync<T>(
                hashKey,
                queryOperator,
                [rangeKey],
                queryConfig
            );
        }

        return search.GetRemainingAsync();
    }

    public async Task<(List<T> Items, string? NextToken)> QueryPaginatedAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string hashKey,
        string? rangeKey,
        QueryOperator queryOperator,
        string? indexName,
        int pageSize,
        string? paginationToken,
        bool scanIndexForward = false)
    {
        var (pkAttr, skAttr) = GetKeyAttributeNames(indexName);

        var filter = new QueryFilter();
        filter.AddCondition(pkAttr, QueryOperator.Equal, hashKey);
        if (rangeKey != null)
            filter.AddCondition(skAttr, queryOperator, rangeKey);

        var search = _dbContext.FromQueryAsync<T>(
            new QueryOperationConfig
            {
                IndexName = indexName,
                Limit = pageSize,
                PaginationToken = DecodeCursor(paginationToken),
                BackwardSearch = !scanIndexForward,
                Filter = filter,
            },
            new FromQueryConfig { OverrideTableName = _tableName }
        );

        var results = await search.GetNextSetAsync();
        return (results, EncodeCursor(search.PaginationToken));
    }

    public async Task<int> CountAsync(string hashKey, string rangeKeyPrefix, string? indexName)
    {
        var (pkAttr, skAttr) = GetKeyAttributeNames(indexName);

        var request = new QueryRequest
        {
            TableName = _tableName,
            IndexName = indexName,
            Select = Select.COUNT,
            KeyConditionExpression = "#pk = :pk AND begins_with(#sk, :sk)",
            ExpressionAttributeNames = new Dictionary<string, string> { ["#pk"] = pkAttr, ["#sk"] = skAttr },
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = new(hashKey),
                [":sk"] = new(rangeKeyPrefix),
            },
        };

        var count = 0;
        Dictionary<string, AttributeValue>? lastKey = null;
        do
        {
            request.ExclusiveStartKey = lastKey;
            var response = await _client.QueryAsync(request);
            count += response.Count.GetValueOrDefault();
            lastKey = response.LastEvaluatedKey is { Count: > 0 } ? response.LastEvaluatedKey : null;
        } while (lastKey != null);

        return count;
    }

    private static string? EncodeCursor(string? paginationToken)
    {
        if (string.IsNullOrEmpty(paginationToken) || paginationToken == "{}")
            return null;

        return Convert.ToBase64String(Encoding.UTF8.GetBytes(paginationToken))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string? DecodeCursor(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor))
            return null;

        var base64 = cursor.Replace('-', '+').Replace('_', '/');
        base64 = base64.PadRight(base64.Length + (4 - base64.Length % 4) % 4, '=');

        try
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(base64));
        }
        catch (FormatException)
        {
            throw new ArgumentException("invalid pagination cursor");
        }
    }

    public async Task<List<T>> BatchGetAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        IEnumerable<(string pk, string sk)> keys)
    {
        var batchGet = _dbContext.CreateBatchGet<T>(new BatchGetConfig()
        {
            OverrideTableName = _tableName,
        });

        foreach (var (pk, sk) in keys)
        {
            batchGet.AddKey(pk, sk);
        }

        await batchGet.ExecuteAsync();
        return batchGet.Results;
    }

    public ITransactWrite<T> CreateTransactionPart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>()
    {
        return _dbContext.CreateTransactWrite<T>(new TransactWriteConfig
        {
            OverrideTableName = _tableName
        });
    }

    public Task ExecuteTransactWriteAsync(params ITransactWrite[] transactionItems)
    {
        var multiTableTx = _dbContext.CreateMultiTableTransactWrite(transactionItems);
        return multiTableTx.ExecuteAsync();
    }

    public IBatchWrite<T> CreateBatchWritePart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>()
    {
        return _dbContext.CreateBatchWrite<T>(new BatchWriteConfig
        {
            OverrideTableName = _tableName
        });
    }

    public Task ExecuteBatchWriteAsync(params IBatchWrite[] batchParts)
    {
        var multiTableBatch = _dbContext.CreateMultiTableBatchWrite(batchParts);
        return multiTableBatch.ExecuteAsync();
    }

    private static (string pk, string sk) GetKeyAttributeNames(string? indexName) => indexName switch
    {
        "GSI1" => ("GSI1PK", "GSI1SK"),
        "GSI2" => ("GSI1PK", "GSI2SK"),
        "GSI3" => ("GSI3PK", "GSI3SK"),
        _ => ("PK", "SK")
    };
}
