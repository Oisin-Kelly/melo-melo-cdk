using Domain;

namespace Ports.Services;

// The track or album behind a share link: looked up the same way for the invite preview, the
// viewer relation, accepting, and the owner's link management.
public interface ILinkTargetService
{
    /// The item, or null if the kind is unknown or the item no longer exists
    public Task<LinkItem?> GetAsync(string kind, string id);

    /// The usual access rule for the item: owner, direct share or album grant (tracks), owner or
    /// album share (albums)
    public Task<bool> HasAccessAsync(LinkItem item, string username);
}
