using Domain;

namespace Ports.Repositories;

public interface IProgressRepository
{
    Task UpsertAsync(string username, string contextType, string contextId, string trackId, int positionSeconds);
    Task ClearAsync(string username);
    Task<ProgressEntry?> GetResolvableAsync(string username);
}
