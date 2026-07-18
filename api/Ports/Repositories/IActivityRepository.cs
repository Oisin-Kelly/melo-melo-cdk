using Domain;

namespace Ports.Repositories;

public interface IActivityRepository
{
    Task<PaginatedResult<ActivityEntry>> GetActivityAsync(string username, int pageSize, string? cursor);
    Task MarkActivitySeenAsync(string username);
}
