using Domain;

namespace Ports.Repositories;

public interface IFeedRepository
{
    /// The viewer's unified home feed (tracks + albums shared with them), date-sorted,
    /// optionally filtered to one type. Entries whose target no longer resolves
    /// (deleted) are dropped.
    Task<PaginatedResult<FeedEntry>> GetFeedAsync(string username, string? type,
        bool ascending, int pageSize, string? cursor);
}
