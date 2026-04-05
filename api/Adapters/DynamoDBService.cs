using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Ports;

namespace Adapters;

// ReSharper disable once InconsistentNaming
public sealed class DynamoDBService : IDynamoDBService
{
    private readonly DynamoDBContext _dbContext;
    private readonly string _tableName;

    public DynamoDBService(IAmazonDynamoDB dynamoDbClient, string tableName)
    {
        _dbContext = new DynamoDBContextBuilder()
            .WithDynamoDBClient(() => dynamoDbClient)
            .Build();

        _tableName = tableName;
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
            OverrideTableName = _tableName
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
            OverrideTableName = _tableName
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
                PaginationToken = paginationToken,
                BackwardSearch = !scanIndexForward,
                Filter = filter,
            },
            new FromQueryConfig { OverrideTableName = _tableName }
        );

        var results = await search.GetNextSetAsync();
        return (results, search.PaginationToken);
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

    private static (string pk, string sk) GetKeyAttributeNames(string? indexName) => indexName switch
    {
        "GSI1" => ("GSI1PK", "GSI1SK"),
        "GSI2" => ("GSI1PK", "GSI2SK"),
        _ => ("PK", "SK")
    };
}
