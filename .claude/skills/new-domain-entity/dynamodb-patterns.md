# DynamoDB Data Access Patterns

All access goes through `IDynamoDBService` (injected via constructor).

## Single item lookup

```csharp
var item = await _dynamoDbService.GetFromDynamoAsync<{Entity}DataModel>(
    $"PREFIX#{id}", "SORT_KEY");
// Returns null if not found
```

## Write a single item

```csharp
var item = new {Entity}DataModel
{
    Pk = $"PREFIX#{id}",
    Sk = "SORT_KEY",
    Gsi1Pk = $"GSI1PREFIX#{value}",
    Gsi1Sk = "GSI1_SORT",
    // ... other properties
};
await _dynamoDbService.WriteToDynamoAsync(item);
```

## Query by hash key (main table)

```csharp
var items = await _dynamoDbService.QueryAsync<{Entity}DataModel>(
    $"PREFIX#{id}");
// Returns all items with that PK
```

## Query by hash + range key

```csharp
var items = await _dynamoDbService.QueryAsync<{Entity}DataModel>(
    $"PREFIX#{id}",
    $"SORT_PREFIX#{value}",
    QueryOperator.Equal);
```

## Query on GSI1

```csharp
var items = await _dynamoDbService.QueryAsync<{Entity}DataModel>(
    hashKey: $"GSI1PREFIX#{value}",
    rangeKey: $"GSI1_SORT",
    queryOperator: QueryOperator.Equal,
    indexName: "GSI1");
```

## Batch get multiple items

```csharp
var keys = items.Select(i => (pk: $"USER#{i.Username}", sk: "PROFILE"));
var results = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);
```

## Transactional writes (atomic multi-item operations)

Used when multiple items must be written atomically (e.g. follow + update counters).

```csharp
// Part 1: Save a new record
var tx1 = _dynamoDbService.CreateTransactionPart<{Entity}DataModel>();
tx1.AddSaveItem(newRecord);

// Part 2: Update an existing record with an expression
var tx2 = _dynamoDbService.CreateTransactionPart<UserDataModel>();
tx2.AddSaveItem(
    $"USER#{username}",
    "PROFILE",
    new Expression()
    {
        ExpressionStatement = "ADD someCount :val",
        ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":val", 1 } }
    }
);

// Part 3: Delete a record
var tx3 = _dynamoDbService.CreateTransactionPart<{Entity}DataModel>();
tx3.AddDeleteItem(recordToDelete);

await _dynamoDbService.ExecuteTransactWriteAsync(tx1, tx2, tx3);
```

## Partial updates with UpdateExpressionBuilder

```csharp
var builder = new UpdateExpressionBuilder();

// SET if value is non-null/non-whitespace, REMOVE if null
builder.AddNullableString("fieldName", "alias", value);

// Always SET (for non-string values like booleans)
builder.AddValue("fieldName", "alias", value);

// Always REMOVE
builder.RemoveField("fieldName", "alias");

if (!builder.IsEmpty)
{
    var tx = _dynamoDbService.CreateTransactionPart<{Entity}DataModel>();
    tx.AddSaveItem($"PREFIX#{id}", "SORT_KEY", builder.Build());
    await _dynamoDbService.ExecuteTransactWriteAsync(tx);
}
```

## Common query + batch get pattern (resolve relationships)

```csharp
// 1. Query for relationship records
var follows = await _dynamoDbService.QueryAsync<UserFollowDataModel>($"FOLLOW#{username}");

if (follows.Count == 0) return [];

// 2. Batch get the related profiles
var keys = follows.Select(f => (f.Sk, "PROFILE"));
var profiles = await _dynamoDbService.BatchGetAsync<UserDataModel>(keys);
return profiles.ToList<User>();
```

## Parallel batch gets (resolve multiple relationship types)

```csharp
var tasks = new List<Task>
{
    GetBatchTracksAsync(sharedItems),
    GetBatchOwnersAsync(sharedItems)
};
await Task.WhenAll(tasks);

var tracks = ((Task<List<TrackDataModel>>)tasks[0]).Result.ToDictionary(t => t.Sk);
var owners = ((Task<List<UserDataModel>>)tasks[1]).Result.ToDictionary(u => u.Pk);

// Join in memory
```
