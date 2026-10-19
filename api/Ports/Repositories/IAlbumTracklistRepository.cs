using Domain;

namespace Ports.Repositories;

// An album's ordered tracklist (memberships). Changing it fans album grants out to the album's
// current recipients, so access always follows the tracklist.
public interface IAlbumTracklistRepository
{
    public Task<PaginatedResult<TrackSummary>> GetAlbumTracksAsync(string albumId, string viewerUsername, int pageSize, string? cursor);
    public Task<List<string>> GetAlbumTrackIdsAsync(string albumId);
    /// Declarative save: orderedTrackIds (already validated — lowercased, deduped,
    /// owner's own tracks, within the cap) become the tracklist in that order. New
    /// ids fan out grants to existing recipients, dropped members have their
    /// album-derived grants revoked, kept members are re-ranked only. Returns the
    /// number of tracks added and removed.
    public Task<(int Added, int Removed)> SetTracksAsync(string albumId, string ownerUsername,
        IReadOnlyList<string> orderedTrackIds);

    // Track-deletion path: takes the track out of every album of its owner (grants + counters)
    public Task RemoveTrackFromAllAlbumsAsync(string ownerUsername, string trackId);

    // Album-deletion cleanup: drops every membership (grants are revoked by the share side first)
    public Task DeleteAllTracksAsync(string albumId);
}
