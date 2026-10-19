using System.Diagnostics.CodeAnalysis;
using Amazon.DynamoDBv2.DataModel;
using Ports.Services;

namespace Adapters.Repositories;

// A transaction part that ADDs deltas to an item's denormalized counters (likeCount, shareCount,
// trackCount/totalDurationSeconds, follower counts). Every repository's counter write goes through
// here so they're composable into the same transaction as the record they count.
internal static class CounterUpdates
{
    public static ITransactWrite CounterUpdate<[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.All)] T>(
        this IDynamoDBService db, (string Pk, string Sk) key, params (string Attribute, long Delta)[] deltas)
    {
        var tx = db.CreateTransactionPart<T>();
        tx.AddSaveItem(key.Pk, key.Sk, CounterExpressions.Add(deltas));
        return tx;
    }
}
