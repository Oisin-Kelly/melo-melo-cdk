using Amazon.DynamoDBv2.DocumentModel;

namespace Adapters.Repositories;

// Builds "ADD attr :delta, …" update expressions for the denormalized counters
// DynamoDB's ADD treats an absent attribute as 0, so no initialization needed.
internal static class CounterExpressions
{
    public static Expression Add(params (string Attribute, long Delta)[] deltas)
    {
        var names = new Dictionary<string, string>();
        var values = new Dictionary<string, DynamoDBEntry>();
        var parts = new List<string>();

        for (var i = 0; i < deltas.Length; i++)
        {
            names[$"#c{i}"] = deltas[i].Attribute;
            values[$":c{i}"] = deltas[i].Delta;
            parts.Add($"#c{i} :c{i}");
        }

        return new Expression
        {
            ExpressionStatement = "ADD " + string.Join(", ", parts),
            ExpressionAttributeNames = names,
            ExpressionAttributeValues = values,
        };
    }
}