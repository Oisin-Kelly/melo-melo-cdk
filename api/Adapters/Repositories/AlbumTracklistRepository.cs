using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class AlbumTracklistRepository : IAlbumTracklistRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public AlbumTracklistRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<TrackSummary>> GetAlbumTracksAsync(string albumId, string viewerUsername,
        int pageSize, string? cursor)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var (memberships, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumTrackDataModel>(
            hashKey: $"ALBUM#{normalisedId}",
            rangeKey: "ORDER#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: true
        );

        if (memberships.Count == 0)
            return new PaginatedResult<TrackSummary> { Items = [], NextCursor = null };

        var trackRefs = memberships
            .Select(m => (m.TrackId, m.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTrackSummariesAsync(_dynamoDbService, trackRefs, viewerUsername);

        var tracks = memberships
            .Select(m => tracksById.GetValueOrDefault(m.TrackId))
            .OfType<TrackSummary>()
            .ToList();

        return new PaginatedResult<TrackSummary> { Items = tracks, NextCursor = nextToken };
    }

    public async Task<List<string>> GetAlbumTrackIdsAsync(string albumId)
    {
        var memberships = await AlbumRecords.GetMembershipsAsync(_dynamoDbService, albumId.ToLowerInvariant());
        return memberships.Select(m => m.TrackId).ToList();
    }

    public async Task<(int Added, int Removed)> SetTracksAsync(string albumId, string ownerUsername,
        IReadOnlyList<string> orderedTrackIds)
    {
        var normalisedId = albumId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var membershipsTask = AlbumRecords.GetMembershipsAsync(_dynamoDbService, normalisedId);
        var sharesTask = AlbumRecords.GetSharesAsync(_dynamoDbService, normalisedId);
        await Task.WhenAll(membershipsTask, sharesTask);

        var byId = membershipsTask.Result.ToDictionary(m => m.TrackId, StringComparer.OrdinalIgnoreCase);
        var recipients = sharesTask.Result.Select(s => s.Recipient).ToList();

        var keep = orderedTrackIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var addedIds = orderedTrackIds.Where(id => !byId.ContainsKey(id)).ToList();
        var removed = membershipsTask.Result.Where(m => !keep.Contains(m.TrackId)).ToList();

        // Grants first (revoke dropped, then grant new), memberships after, counters
        // last — the save is declarative, so a partial failure is fixed by the
        // client retrying the same PUT
        await AlbumRecords.DeleteGrantsAsync(_dynamoDbService, removed.Select(m => m.TrackId).ToList(), recipients,
            normalisedId);
        await AlbumRecords.WriteGrantsAsync(_dynamoDbService, addedIds, recipients, normalisedId, ownerUsername, now);

        var durations = await AlbumRecords.GetTrackDurationsAsync(_dynamoDbService, ownerUsername, addedIds);

        if (removed.Count > 0 || orderedTrackIds.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
            foreach (var membership in removed)
                membershipBatch.AddDeleteItem(membership);

            var rank = 0;
            foreach (var trackId in orderedTrackIds)
            {
                rank += MembershipRank.Gap;
                if (byId.TryGetValue(trackId, out var membership))
                {
                    // Kept member: re-rank only, addedAt and denormalized duration survive
                    membership.Gsi1Sk = MembershipRank.ToSortKey(rank);
                    membershipBatch.AddPutItem(membership);
                }
                else
                {
                    membershipBatch.AddPutItem(AlbumRecords.BuildMembership(normalisedId, trackId, ownerUsername, now,
                        rank, durations.GetValueOrDefault(trackId)));
                }
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        if (addedIds.Count > 0 || removed.Count > 0)
            await AlbumRecords.UpdateCountersAsync(_dynamoDbService, ownerUsername, normalisedId,
                ("trackCount", addedIds.Count - removed.Count),
                ("totalDurationSeconds",
                    addedIds.Sum(id => (long)durations.GetValueOrDefault(id))
                    - removed.Sum(m => (long)m.Duration)));

        return (addedIds.Count, removed.Count);
    }

    public async Task RemoveTrackFromAllAlbumsAsync(string ownerUsername, string trackId)
    {
        var (_, memberships) = await GetOwnAlbumsContainingAsync(ownerUsername, trackId);
        foreach (var membership in memberships)
            await RemoveMembershipAsync(membership, ownerUsername);
    }

    /// The owner's albums and the memberships of `trackId` among them.
    private async Task<(List<AlbumDataModel> Albums, List<AlbumTrackDataModel> Memberships)>
        GetOwnAlbumsContainingAsync(string ownerUsername, string trackId)
    {
        // Memberships are keyed by album (ALBUM#{id} / TRACK#{id}), so finding the
        // albums containing a track means checking each of the owner's albums —
        // albums only ever contain the owner's own tracks. Needs the full set, so
        // it reads the base table rather than the paginated GSI3 listing.
        var albums = await _dynamoDbService.QueryAsync<AlbumDataModel>(
            $"USER#{ownerUsername}",
            "ALBUM#",
            QueryOperator.BeginsWith);

        if (albums.Count == 0)
            return (albums, []);

        // One BatchGet probes every album's membership key at once (album ids are unique,
        // so no duplicate keys)
        var normalisedTrackId = trackId.ToLowerInvariant();
        var memberships = await _dynamoDbService.BatchGetAsync<AlbumTrackDataModel>(
            albums.Select(a => (pk: $"ALBUM#{a.AlbumId}", sk: $"TRACK#{normalisedTrackId}")));
        return (albums, memberships);
    }

    public async Task<List<AlbumSummary>> GetAlbumsContainingTrackAsync(string trackId, string trackOwnerUsername,
        string viewerUsername)
    {
        List<AlbumDataModel> albums;
        if (trackOwnerUsername == viewerUsername)
        {
            var (own, memberships) = await GetOwnAlbumsContainingAsync(trackOwnerUsername, trackId);
            var containing = memberships.Select(m => m.AlbumId).ToHashSet();
            albums = own.Where(a => containing.Contains(a.AlbumId)).ToList();
        }
        else
        {
            // Someone else's track: only albums shared with the viewer, which are exactly
            // the album grants they hold on it (TRACK#{t} / SHARED#{viewer}#ALBUM#{id})
            var grants = await _dynamoDbService.QueryAsync<AlbumTrackGrantDataModel>(
                $"TRACK#{trackId.ToLowerInvariant()}",
                $"SHARED#{viewerUsername}#ALBUM#",
                QueryOperator.BeginsWith);
            if (grants.Count == 0)
                return [];
            albums = await _dynamoDbService.BatchGetAsync<AlbumDataModel>(
                grants.Select(g => g.AlbumId).Distinct().Select(id => Keys.Album(trackOwnerUsername, id)));
        }

        if (albums.Count == 0)
            return [];

        // Every album here is the track owner's
        var ownerTask = ProfileLookup.GetAsync(_dynamoDbService, [trackOwnerUsername]);
        var likedTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(
            _dynamoDbService, viewerUsername, albums.Select(a => a.AlbumId).ToList());
        await Task.WhenAll(ownerTask, likedTask);
        if (!ownerTask.Result.TryGetValue(trackOwnerUsername, out var owner))
            return [];

        return albums
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => AlbumSummary.From(a, owner, likedTask.Result.Contains(a.AlbumId)))
            .ToList();
    }

    public async Task DeleteAllTracksAsync(string albumId)
    {
        var memberships = await AlbumRecords.GetMembershipsAsync(_dynamoDbService, albumId.ToLowerInvariant());
        if (memberships.Count == 0)
            return;

        var batch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
        foreach (var membership in memberships)
            batch.AddDeleteItem(membership);
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    // Track-deletion path — API-driven removals go through SetTracksAsync. Revoke this track's
    // grants first, then the membership, then the counters (from the membership's denormalized
    // duration, so it works even mid-track-deletion).
    private async Task RemoveMembershipAsync(AlbumTrackDataModel membership, string ownerUsername)
    {
        var albumId = membership.Pk.Replace("ALBUM#", "");

        var shares = await AlbumRecords.GetSharesAsync(_dynamoDbService, albumId);
        await AlbumRecords.DeleteGrantsAsync(_dynamoDbService, [membership.TrackId],
            shares.Select(s => s.Recipient).ToList(), albumId);

        var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
        membershipBatch.AddDeleteItem(membership);
        await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);

        await AlbumRecords.UpdateCountersAsync(_dynamoDbService, ownerUsername, albumId,
            ("trackCount", -1), ("totalDurationSeconds", -(long)membership.Duration));
    }
}
