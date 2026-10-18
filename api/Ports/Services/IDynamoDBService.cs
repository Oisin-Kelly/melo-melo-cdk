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

    // For idempotent writes guarded by a condition expression: returns false (nothing written)
    // when a condition fails — i.e. a concurrent request already did it — instead of throwing.
    public Task<bool> TryExecuteTransactWriteAsync(params ITransactWrite[] transactionItems);

    // Adds a put of `item` to `part` that only applies if `condition` holds (e.g. the item doesn't
    // exist yet) — the typed AddSaveItem(item) has no condition overload.
    public void AddConditionalSave<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        ITransactWrite<T> part, T item, Expression condition);

    public IBatchWrite<T> CreateBatchWritePart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>();

    public Task ExecuteBatchWriteAsync(params IBatchWrite[] batchParts);
}