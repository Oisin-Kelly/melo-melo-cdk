using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2.DocumentModel;

namespace Ports;

// ReSharper disable once InconsistentNaming
public interface IDynamoDBService
{
    Task WriteToDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(T value);

    Task<T?> GetFromDynamoAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(string pk, string sk);

    Task<List<T>> QueryByGsiAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        string gsiName,
        string gsiHashKey,
        string? gsiRangeKey = null,
        QueryOperator queryOperator = QueryOperator.Equal);

    Task<List<T>> BatchGetAsync<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        IEnumerable<(string pk, string sk)> keys);
}