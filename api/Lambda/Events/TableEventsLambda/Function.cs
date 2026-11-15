using Amazon.Lambda.Annotations;
using Amazon.Lambda.Core;
using Amazon.Lambda.DynamoDBEvents;
using Domain;
using Ports.Events;

namespace TableEventsLambda;

// Reads the table's stream (an event source mapping, not an HTTP route) and hands each
// change to the handler — today the activity feed (Adapters/Events/ActivityEvents). Records
// arrive in order per item, so a batch runs one record at a time; on the first failure it
// stops and reports that record, and Lambda retries from it (ReportBatchItemFailures),
// keeping later changes behind it. After the mapping's retries it goes to the dead-letter queue.
public sealed class Function
{
    private readonly ITableChangeHandler _handler;

    public Function(ITableChangeHandler handler)
    {
        _handler = handler;
    }

    [LambdaFunction]
    public async Task<StreamsEventResponse> FunctionHandler(DynamoDBEvent dynamoEvent, ILambdaContext context)
    {
        var response = new StreamsEventResponse { BatchItemFailures = [] };

        foreach (var record in dynamoEvent.Records ?? [])
        {
            var change = ToChange(record);
            if (change is null)
                continue;
            try
            {
                await _handler.HandleAsync(change);
            }
            catch (Exception ex)
            {
                context.Logger.LogError(
                    $"Error occured in TableEventsLambda on {record.EventName} {record.Dynamodb?.SequenceNumber}. Error: {ex.Message}");
                response.BatchItemFailures.Add(new StreamsEventResponse.BatchItemFailure
                {
                    ItemIdentifier = record.Dynamodb?.SequenceNumber,
                });
                break;
            }
        }

        return response;
    }

    internal static TableChange? ToChange(DynamoDBEvent.DynamodbStreamRecord record)
    {
        var kind = record.EventName switch
        {
            "INSERT" => TableChangeKind.Insert,
            "MODIFY" => TableChangeKind.Modify,
            "REMOVE" => TableChangeKind.Remove,
            _ => (TableChangeKind?)null,
        };
        if (kind is null || record.Dynamodb?.Keys is null)
            return null;

        return new TableChange(
            kind.Value,
            Flatten(record.Dynamodb.Keys)!,
            Flatten(record.Dynamodb.NewImage),
            Flatten(record.Dynamodb.OldImage),
            // TTL deletes are made by the DynamoDB service itself
            IsExpiry: record.UserIdentity is { Type: "Service", PrincipalId: "dynamodb.amazonaws.com" });
    }

    // Strings and numbers only (numbers as DynamoDB's own digits)
    private static Dictionary<string, string>? Flatten(Dictionary<string, DynamoDBEvent.AttributeValue>? image) =>
        image?
            .Where(kv => kv.Value.S is not null || kv.Value.N is not null)
            .ToDictionary(kv => kv.Key, kv => (kv.Value.S ?? kv.Value.N)!);
}
