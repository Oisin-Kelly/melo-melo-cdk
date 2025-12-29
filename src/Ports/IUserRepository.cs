using Domain;

namespace Ports;

public interface IUserRepository
{
    public Task<User?> GetUserByUsername(string username);
    public Task FollowUser(string usernameToFollow, string followerUsername);
    public Task UnfollowUser(string usernameToUnfollow, string followerUsername);
    public Task<UserFollow> GetFollowStatus(string username, string followerUsername);
}