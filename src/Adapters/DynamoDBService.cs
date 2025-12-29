using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;
using Ports;

namespace Adapters;

// ReSharper disable once InconsistentNaming
public class DynamoDBService : IDynamoDBService
{
    private readonly DynamoDBContext _dbContext;
    private readonly string _tableName;
    private readonly IAmazonDynamoDB _dynamoDbClient;

    public DynamoDBService(IAmazonDynamoDB dynamoDbClient, string tableName)
    {
        _dynamoDbClient = dynamoDbClient;

        _dbContext = new DynamoDBContextBuilder()
            .WithDynamoDBClient(() => dynamoDbClient)
            .Build();

        _tableName = tableName;
    }

    public async Task WriteToDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(T value)
    {
        await _dbContext.SaveAsync(value, new SaveConfig()
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

    public async Task<List<T>> QueryByGsiAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string gsiName,
        string gsiHashKey,
        string? gsiRangeKey = null,
        QueryOperator queryOperator = QueryOperator.Equal)
    {
        var queryConfig = new QueryConfig()
        {
            IndexName = gsiName,
            OverrideTableName = _tableName
        };

        IAsyncSearch<T> search;

        if (gsiRangeKey == null)
        {
            search = _dbContext.QueryAsync<T>(gsiHashKey, queryConfig);
        }
        else
        {
            search = _dbContext.QueryAsync<T>(
                gsiHashKey,
                queryOperator,
                new[] { gsiRangeKey },
                queryConfig
            );
        }

        return await search.GetRemainingAsync();
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

    public async Task ExecuteTransactWriteAsync(List<TransactWriteItem> transactionItems)
    {
        var request = new TransactWriteItemsRequest
        {
            TransactItems = transactionItems
        };

        foreach (var item in request.TransactItems)
        {
            if (item.Delete != null) item.Delete.TableName = _tableName;
            if (item.Update != null) item.Update.TableName = _tableName;
            if (item.Put != null) item.Put.TableName = _tableName;
            if (item.ConditionCheck != null) item.ConditionCheck.TableName = _tableName;
        }

        await _dynamoDbClient.TransactWriteItemsAsync(request);
    }
}