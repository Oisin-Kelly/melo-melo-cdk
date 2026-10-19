using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Services;

namespace Adapters.Repositories;

// Low-level album records shared by the album repositories: the membership and share queries,
// the per-(track × recipient) grants that both the tracklist (fan-out on add/remove) and sharing
// (fan-out on share/unshare) write, and the album meta counters. Grants are the access mechanism,
// so they're spelt in exactly one place.
internal static class AlbumRecords
{
    public static Task<List<AlbumTrackDataModel>> GetMembershipsAsync(IDynamoDBService db, string normalisedAlbumId) =>
        db.QueryAsync<AlbumTrackDataModel>($"ALBUM#{normalisedAlbumId}", "TRACK#", QueryOperator.BeginsWith);

    public static Task<List<AlbumShareDataModel>> GetSharesAsync(IDynamoDBService db, string normalisedAlbumId) =>
        db.QueryAsync<AlbumShareDataModel>($"ALBUM#{normalisedAlbumId}", "SHARED#", QueryOperator.BeginsWith);

    public static Task WriteGrantsAsync(IDynamoDBService db, IReadOnlyList<string> trackIds,
        IReadOnlyList<string> recipients, string normalisedAlbumId, string trackOwnerUsername, long now)
    {
        if (trackIds.Count == 0 || recipients.Count == 0)
            return Task.CompletedTask;

        var batch = db.CreateBatchWritePart<AlbumTrackGrantDataModel>();
        foreach (var trackId in trackIds)
            foreach (var recipient in recipients)
            {
                batch.AddPutItem(new AlbumTrackGrantDataModel
                {
                    Pk = $"TRACK#{trackId.ToLowerInvariant()}",
                    Sk = AlbumTrackGrantDataModel.BuildSk(recipient, normalisedAlbumId),
                    TrackOwnerUsername = trackOwnerUsername,
                    AlbumId = normalisedAlbumId,
                    GrantedAt = now,
                });
            }

        return db.ExecuteBatchWriteAsync(batch);
    }

    public static Task DeleteGrantsAsync(IDynamoDBService db, IReadOnlyList<string> trackIds,
        IReadOnlyList<string> recipients, string normalisedAlbumId)
    {
        if (trackIds.Count == 0 || recipients.Count == 0)
            return Task.CompletedTask;

        var batch = db.CreateBatchWritePart<AlbumTrackGrantDataModel>();
        foreach (var trackId in trackIds)
            foreach (var recipient in recipients)
                batch.AddDeleteKey($"TRACK#{trackId.ToLowerInvariant()}",
                    AlbumTrackGrantDataModel.BuildSk(recipient, normalisedAlbumId));

        return db.ExecuteBatchWriteAsync(batch);
    }

    public static AlbumTrackDataModel BuildMembership(string normalisedAlbumId, string trackId,
        string ownerUsername, long now, int rank, int duration) => new()
    {
        Pk = $"ALBUM#{normalisedAlbumId}",
        Sk = $"TRACK#{trackId.ToLowerInvariant()}",
        Gsi1Pk = $"ALBUM#{normalisedAlbumId}",
        Gsi1Sk = MembershipRank.ToSortKey(rank),
        TrackOwnerUsername = ownerUsername,
        Duration = duration,
        AddedAt = now,
    };

    // Durations of the owner's tracks (album members denormalize them for counters)
    public static async Task<Dictionary<string, int>> GetTrackDurationsAsync(IDynamoDBService db,
        string ownerUsername, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return [];

        var tracks = await db.BatchGetAsync<TrackDataModel>(trackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => Keys.Track(ownerUsername, id)));

        return tracks.ToDictionary(t => t.TrackId, t => t.Duration);
    }

    public static ITransactWrite CounterUpdate(IDynamoDBService db, string ownerUsername, string normalisedAlbumId,
        params (string Attribute, long Delta)[] deltas) =>
        db.CounterUpdate<AlbumDataModel>(Keys.Album(ownerUsername, normalisedAlbumId), deltas);

    public static Task UpdateCountersAsync(IDynamoDBService db, string ownerUsername, string normalisedAlbumId,
        params (string Attribute, long Delta)[] deltas) =>
        db.ExecuteTransactWriteAsync(CounterUpdate(db, ownerUsername, normalisedAlbumId, deltas));
}
