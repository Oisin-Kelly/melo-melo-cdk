using Domain;

namespace Ports.Repositories;

// People you may know: worked out on request from the user's follow and share records
public interface ISuggestionRepository
{
    public Task<List<SuggestedUser>> GetSuggestionsAsync(string username, int limit);

    /// Dismissed (✕): never suggested again for 180 days
    public Task HideAsync(string username, string hiddenUsername);
}
