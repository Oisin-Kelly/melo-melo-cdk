using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.DataModel;
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
        var saveConfig = new SaveConfig
        {
            OverrideTableName = _tableName
        };

        await _dbContext.SaveAsync(value, saveConfig);
    }
}

public class DynamoDbOptions
{
    public string TableName { get; set; }
}
