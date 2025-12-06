using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Ports;

namespace Adapters;

// ReSharper disable once InconsistentNaming
public class DynamoDBService : IDynamoDBService
{
    private readonly DynamoDBContext _dbContext;
    private readonly string _tableName;
    
    public DynamoDBService(IAmazonDynamoDB dynamoDbClient, string tableName)
    {
        IAmazonDynamoDB CreateClient()
        {
            return dynamoDbClient;
        }
        _dbContext = new DynamoDBContextBuilder()
            .WithDynamoDBClient(CreateClient)
            .Build();
        
        _tableName = tableName;
    }

    public async Task WriteToDynamoAsync<T>(T value)
    {
        await _dbContext.SaveAsync(value, new SaveConfig()
        {
            OverrideTableName = _tableName
        });
    }

    public async Task<T> GetByPrimaryKeyAsync<T>(string hashKey, string? rangeKey = null)
    {
        if (rangeKey == null)
            return await _dbContext.LoadAsync<T>(hashKey, new LoadConfig()
            {
                OverrideTableName = _tableName
            });
        
        return await _dbContext.LoadAsync<T>(hashKey, rangeKey, new LoadConfig()
        {
            OverrideTableName = _tableName
        });
    }

    public async Task<List<T>> QueryByGsiAsync<T>(
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
                new string[] { gsiRangeKey },
                queryConfig
            );
        }
        
        return await search.GetRemainingAsync();
    }
}

