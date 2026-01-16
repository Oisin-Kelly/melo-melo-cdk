using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Amazon.DynamoDBv2.Model;

namespace Ports;

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

    public Task<List<T>> BatchGetAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        IEnumerable<(string pk, string sk)> keys);

    public ITransactWrite<T>
        CreateTransactionPart<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>();

    public Task ExecuteTransactWriteAsync(params ITransactWrite[] transactionItems);
}