using Amazon.DynamoDBv2.DocumentModel;

namespace Adapters.Repositories;

// Existence guards for idempotent relationship writes (like/unlike, remove-from-library). Paired
// with TryExecuteTransactWriteAsync, a guard that fails cancels the whole transaction — counters
// and activity included — so a concurrent duplicate request is a clean no-op.
// #condPk is deliberately unlike the generated update placeholders (#a0…, #c0…): the SDK
// merges the update and condition name maps.
internal static class ConditionExpressions
{
    public static Expression ItemExists() => Build("attribute_exists(#condPk)");

    public static Expression ItemNotExists() => Build("attribute_not_exists(#condPk)");

    private static Expression Build(string statement) => new()
    {
        ExpressionStatement = statement,
        ExpressionAttributeNames = new Dictionary<string, string> { { "#condPk", "PK" } },
    };
}
