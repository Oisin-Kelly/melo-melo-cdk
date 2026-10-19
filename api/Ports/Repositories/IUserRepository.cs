using Domain;

namespace Ports.Repositories;

public interface IUserRepository
{
    public Task<User?> GetUserByUsername(string username);
    public Task<User?> UpdateUser(User user, bool clearImage);

    public Task MarkSeenAsync(string username);
    public Task<(long? LastSeenAt, long? ActivitySeenAt)> GetSeenMarkersAsync(string username);

    public Task<PaginatedResult<UserSummary>> SearchUsersAsync(string prefix, int pageSize, string? cursor);

    public Task<List<string>> GetValidatedRecipientsAsync(List<string> usernames, string senderUsername);
}