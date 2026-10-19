namespace Adapters.Tests.Repositories;

// Every repository test class joins this collection: they share one DynamoDB Local table
// (created once by the fixture) and run serially. Each test pins down a behaviour that was a
// real bug — the e2e suite covers the HTTP surface. Concurrent tests fire both calls together
// with Task.WhenAll, i.e. the "double-tap".
[CollectionDefinition(Name)]
public sealed class DynamoDbLocalCollection : ICollectionFixture<DynamoDbLocalFixture>
{
    public const string Name = "DynamoDB Local";
}
