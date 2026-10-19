using Domain;
using Ports.Services;

namespace Adapters.Repositories;

// The follow record lookup, shared by FollowRepository and the recipient checks in UserRepository
// (incomingShares = FOLLOWING needs "does the recipient follow the sender?").
internal static class FollowRecords
{
    public static Task<UserFollowDataModel?> GetAsync(IDynamoDBService db, string followedUsername,
        string followerUsername) =>
        db.GetFromDynamoAsync<UserFollowDataModel>($"FOLLOW#{followedUsername}", $"USER#{followerUsername}");

    public static async Task<bool> IsFollowingAsync(IDynamoDBService db, string followedUsername,
        string followerUsername) =>
        await GetAsync(db, followedUsername, followerUsername) is not null;
}
