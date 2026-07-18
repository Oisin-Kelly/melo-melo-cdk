using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;

namespace Ports.Services;

// ReSharper disable once InconsistentNaming
public interface IDynamoDBService
{
    public Task WriteToDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(T value);

    public Task<T?> GetFromDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string pk, string sk);

    public Task<List<T>> QueryAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string hashKey,
        string? rangeKey = null,
        QueryOperator queryOperator = QueryOperator.Equal,
        string? indexName = null);

    public Task<(List<T> Items, string? NextToken)> QueryPaginatedAsync<
        [DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string hashKey,
        string? rangeKey,
        QueryOperator queryOperator,
        string? indexName,
        int pageSize,
        string? paginationToken,
        bool scanIndexForward = false);

    public Task<int> CountAsync(string hashKey, string rangeKeyPrefix, string? indexName);

    public Task<List<T>> BatchGetAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        IEnumerable<(string pk, string sk)> keys);

    public ITransactWrite<T>
        CreateTransactionPart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>();

    public Task ExecuteTransactWriteAsync(params ITransactWrite[] transactionItems);

    public IBatchWrite<T> CreateBatchWritePart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>();

    public Task ExecuteBatchWriteAsync(params IBatchWrite[] batchParts);
}