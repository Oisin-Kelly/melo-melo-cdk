using Domain;

namespace Ports;

public interface IUserRepository
{
    public Task<User?> GetUserByUsername(string username);
    public Task<User?> UpdateUser(User user, bool clearImage);
    public Task FollowUser(string usernameToFollow, string followerUsername);
    public Task UnfollowUser(string usernameToUnfollow, string followerUsername);
    public Task<UserFollow> GetFollowStatus(string username, string followerUsername);
    public Task<List<User>> GetUserFollowers(string username);
    public Task<List<User>> GetUserFollowings(string username);
}