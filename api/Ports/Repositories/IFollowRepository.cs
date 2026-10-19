using Domain;

namespace Ports.Repositories;

public interface IFollowRepository
{
    // Self-follow throws ArgumentException; both are idempotent (guarded against double-taps)
    public Task FollowUser(string usernameToFollow, string followerUsername);
    public Task UnfollowUser(string usernameToUnfollow, string followerUsername);
    public Task<UserFollow> GetFollowStatus(string username, string followerUsername);

    // Newest-first
    public Task<PaginatedResult<UserSummary>> GetUserFollowers(string username, int pageSize, string? cursor);
    public Task<PaginatedResult<UserSummary>> GetUserFollowings(string username, int pageSize, string? cursor);
}
