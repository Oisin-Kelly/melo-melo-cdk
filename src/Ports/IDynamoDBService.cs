using Amazon.DynamoDBv2.DocumentModel;

namespace Ports;

// ReSharper disable once InconsistentNaming
public interface IDynamoDBService
{
    public Task WriteToDynamoAsync<T>(T value);
    public Task<T?> GetFromDynamoAsync<T>(string pk, string sk);
    public Task<List<T>> QueryByGsiAsync<T>(
        string gsiName,
        string gsiHashKey,
        string? gsiRangeKey = null,
        QueryOperator queryOperator = QueryOperator.Equal);
}