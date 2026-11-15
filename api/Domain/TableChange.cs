namespace Domain;

public enum TableChangeKind
{
    Insert,
    Modify,
    Remove,
}

/// One item change from the table's stream, flattened to what the consumers read: every
/// string and number attribute as its string (numbers keep DynamoDB's exact digits, so a
/// key rebuilt from them matches the one written). Nested maps/lists/binary are dropped.
/// `IsExpiry`: a REMOVE done by the table's TTL, not by the app.
public sealed record TableChange(
    TableChangeKind Kind,
    IReadOnlyDictionary<string, string> Keys,
    IReadOnlyDictionary<string, string>? NewImage,
    IReadOnlyDictionary<string, string>? OldImage,
    bool IsExpiry = false);
