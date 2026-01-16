using Amazon.DynamoDBv2.DocumentModel;

namespace Adapters;

public class UpdateExpressionBuilder
{
    private readonly List<string> _setParts = new();
    private readonly List<string> _removeParts = new();
    private readonly Dictionary<string, string> _names = new();
    private readonly Dictionary<string, DynamoDBEntry> _values = new();

    public bool IsEmpty => _setParts.Count == 0 && _removeParts.Count == 0;

    public void AddNullableString(string attrName, string key, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            RemoveField(attrName, key);
        else
            AddValue(attrName, key, value);
    }

    public void AddValue(string attrName, string key, DynamoDBEntry value)
    {
        _names[$"#{key}"] = attrName;
        _values[$":{key}"] = value;
        _setParts.Add($"#{key} = :{key}");
    }

    public void RemoveField(string attrName, string key)
    {
        _names[$"#{key}"] = attrName;
        _removeParts.Add($"#{key}");
    }

    public Expression Build()
    {
        return new Expression
        {
            ExpressionStatement = BuildStatement(),
            ExpressionAttributeNames = _names,
            ExpressionAttributeValues = _values.Count > 0 ? _values : null
        };
    }

    private string BuildStatement()
    {
        var parts = new List<string>();
        if (_setParts.Count > 0) parts.Add("SET " + string.Join(", ", _setParts));
        if (_removeParts.Count > 0) parts.Add("REMOVE " + string.Join(", ", _removeParts));
        return string.Join(" ", parts);
    }
}