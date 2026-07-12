using Domain;

namespace Ports.Repositories;

public interface IUserRepository
{
    public Task<User?> GetUserByUsername(string username);
    public Task<User?> UpdateUser(User user, bool clearImage);
    public Task FollowUser(string usernameToFollow, string followerUsername);
    public Task UnfollowUser(string usernameToUnfollow, string followerUsername);
    public Task<UserFollow> GetFollowStatus(string username, string followerUsername);
    public Task<PaginatedResult<User>> GetUserFollowers(string username, int pageSize, string? cursor);
    public Task<PaginatedResult<User>> GetUserFollowings(string username, int pageSize, string? cursor);
    public Task<List<string>> GetValidatedRecipientsAsync(List<string> usernames, string senderUsername);
}