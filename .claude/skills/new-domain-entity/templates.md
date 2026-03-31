# Domain Entity Templates

## 1. Domain entity — `api/Domain/{Entity}.cs`

```csharp
using System.Text.Json.Serialization;
using Amazon.DynamoDBv2.DataModel;

namespace Domain;

public record {Entity}
{
    // Required properties
    [JsonPropertyName("camelCaseName")]
    [DynamoDBProperty("camelCaseName")]
    public required string Name { get; set; }

    // Nullable properties — no required keyword
    [JsonPropertyName("description")]
    [DynamoDBProperty("description")]
    public string? Description { get; set; }

    // Numeric properties
    [JsonPropertyName("count")]
    [DynamoDBProperty("count")]
    public required int Count { get; set; }

    // Timestamps as unix milliseconds
    [JsonPropertyName("createdAt")]
    [DynamoDBProperty("createdAt")]
    public required long CreatedAt { get; set; }

    // Boolean properties
    [JsonPropertyName("isPublic")]
    [DynamoDBProperty("isPublic")]
    public required bool IsPublic { get; set; }
}

public record {Entity}DataModel : {Entity}
{
    [DynamoDBHashKey("PK")] public required string Pk { get; set; }

    [DynamoDBRangeKey("SK")] public required string Sk { get; set; }

    [DynamoDBGlobalSecondaryIndexHashKey("GSI1", AttributeName = "GSI1PK")]
    public required string Gsi1Pk { get; set; }

    [DynamoDBGlobalSecondaryIndexRangeKey("GSI1", AttributeName = "GSI1SK")]
    public string? Gsi1Sk { get; set; }

    // Derived properties computed from keys
    // [DynamoDBIgnore]
    // public string OwnerId => Pk.Replace("USER#", "");
}
```

Conventions:
- `{Entity}` = public domain type for API responses (JSON + DynamoDB attributes)
- `{Entity}DataModel` extends domain type, adds PK/SK/GSI1 keys — used only by adapters
- `JsonPropertyName` and `DynamoDBProperty` both use camelCase
- Timestamps are `long` (unix milliseconds via `DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()`)

## 2. Port interface — `api/Ports/I{Entity}Repository.cs`

```csharp
using Domain;

namespace Ports;

public interface I{Entity}Repository
{
    Task<{Entity}?> Get{Entity}ById(string id);
    // Other operations as needed
}
```

Rules:
- No AWS SDK references — ports are pure interfaces
- Only reference Domain types
- Return nullable for lookups that may miss

## 3. Adapter — `api/Adapters/{Entity}Repository.cs`

```csharp
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports;

namespace Adapters;

public sealed class {Entity}Repository : I{Entity}Repository
{
    private readonly IDynamoDBService _dynamoDbService;

    public {Entity}Repository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<{Entity}?> Get{Entity}ById(string id)
    {
        return await _dynamoDbService.GetFromDynamoAsync<{Entity}DataModel>(
            $"PREFIX#{id}", "SORT_KEY");
    }
}
```

See [dynamodb-patterns.md](dynamodb-patterns.md) for all data access patterns.
