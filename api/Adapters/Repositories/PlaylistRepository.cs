using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class PlaylistRepository : IPlaylistRepository
{
    public const string LikesPlaylistId = "likes";
    private const string LikesPlaylistName = "Likes";

    // Sorts after any real 13-digit ms timestamp, so likes is always the first
    // item on the first page of the newest-first GSI3 listing
    private const string LikesGsi3SortKey = "DATE#9999999999999";

    private readonly IDynamoDBService _dynamoDbService;

    public PlaylistRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<Playlist>> GetPlaylistsAsync(string username, int pageSize, string? cursor)
    {
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<PlaylistDataModel>(
            hashKey: $"PLAYLISTS#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        return new PaginatedResult<Playlist>
        {
            Items = items.Select(ToPlaylist).ToList(),
            NextCursor = nextToken,
        };
    }

    public async Task<Playlist?> GetPlaylistAsync(string username, string playlistId)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var item = await _dynamoDbService.GetFromDynamoAsync<PlaylistDataModel>(
            $"USER#{username}", $"PLAYLIST#{normalisedId}");

        return item is not null ? ToPlaylist(item) : null;
    }

    public async Task<Playlist> CreatePlaylistAsync(string username, string name, string? description)
    {
        var playlistId = Guid.NewGuid().ToString("N").ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var item = new PlaylistDataModel
        {
            Pk = $"USER#{username}",
            Sk = $"PLAYLIST#{playlistId}",
            Gsi3Pk = $"PLAYLISTS#{username}",
            Gsi3Sk = $"DATE#{now}",
            Name = name,
            Description = description,
            Type = PlaylistType.Custom,
            CreatedAt = now,
        };

        await _dynamoDbService.WriteToDynamoAsync(item);
        return ToPlaylist(item);
    }

    public async Task<Playlist?> UpdatePlaylistAsync(string username, string playlistId, string? name,
        string? description)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var builder = new UpdateExpressionBuilder();
        builder.AddNullableString("name", "n", name);
        builder.AddNullableString("description", "d", description);

        if (!builder.IsEmpty)
        {
            var tx = _dynamoDbService.CreateTransactionPart<PlaylistDataModel>();
            tx.AddSaveItem($"USER#{username}", $"PLAYLIST#{normalisedId}", builder.Build());
            await _dynamoDbService.ExecuteTransactWriteAsync(tx);
        }

        return await GetPlaylistAsync(username, normalisedId);
    }

    public async Task DeletePlaylistAsync(string username, string playlistId)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        // Memberships first, meta last — a mid-delete crash leaves the playlist visible and the delete retryable
        var memberships = await _dynamoDbService.QueryAsync<PlaylistTrackDataModel>(
            $"PLAYLIST#{normalisedId}",
            "TRACK#",
            QueryOperator.BeginsWith);

        if (memberships.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<PlaylistTrackDataModel>();
            foreach (var membership in memberships)
                membershipBatch.AddDeleteItem(membership);

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        var metaBatch = _dynamoDbService.CreateBatchWritePart<PlaylistDataModel>();
        metaBatch.AddDeleteKey($"USER#{username}", $"PLAYLIST#{normalisedId}");
        await _dynamoDbService.ExecuteBatchWriteAsync(metaBatch);
    }

    public Task AddTracksAsync(string playlistId, IReadOnlyList<Track> tracks)
    {
        if (tracks.Count == 0)
            return Task.CompletedTask;

        var normalisedId = playlistId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var batch = _dynamoDbService.CreateBatchWritePart<PlaylistTrackDataModel>();
        foreach (var track in tracks)
        {
            batch.AddPutItem(new PlaylistTrackDataModel
            {
                Pk = $"PLAYLIST#{normalisedId}",
                Sk = $"TRACK#{track.Id.ToLowerInvariant()}",
                Gsi1Pk = $"PLAYLIST#{normalisedId}",
                Gsi1Sk = $"DATE#{now}",
                TrackOwnerUsername = track.Owner.Username,
                AddedAt = now,
            });
        }

        return _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    public Task RemoveTracksAsync(string playlistId, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return Task.CompletedTask;

        var normalisedId = playlistId.ToLowerInvariant();

        var batch = _dynamoDbService.CreateBatchWritePart<PlaylistTrackDataModel>();
        foreach (var trackId in trackIds)
            batch.AddDeleteKey($"PLAYLIST#{normalisedId}", $"TRACK#{trackId.ToLowerInvariant()}");

        return _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    public async Task<PaginatedResult<Track>> GetPlaylistTracksAsync(string playlistId, int pageSize, string? cursor)
    {
        var normalisedId = playlistId.ToLowerInvariant();

        var (memberships, nextToken) = await _dynamoDbService.QueryPaginatedAsync<PlaylistTrackDataModel>(
            hashKey: $"PLAYLIST#{normalisedId}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (memberships.Count == 0)
            return new PaginatedResult<Track> { Items = [], NextCursor = null };

        var trackRefs = memberships
            .Select(m => (m.TrackId, m.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTracksAsync(_dynamoDbService, trackRefs);

        var tracks = memberships
            .Select(m => tracksById.GetValueOrDefault(m.TrackId))
            .OfType<Track>()
            .ToList();

        return new PaginatedResult<Track> { Items = tracks, NextCursor = nextToken };
    }

    private static Playlist ToPlaylist(PlaylistDataModel item) => new()
    {
        Id = item.PlaylistId,
        Name = item.Name,
        Description = item.Description,
        Type = item.Type,
        CreatedAt = item.CreatedAt,
    };

    public static PlaylistDataModel BuildLikesPlaylistItem(string username, long now) => new()
    {
        Pk = $"USER#{username}",
        Sk = $"PLAYLIST#{LikesPlaylistId}",
        Gsi3Pk = $"PLAYLISTS#{username}",
        Gsi3Sk = LikesGsi3SortKey,
        Name = LikesPlaylistName,
        Type = PlaylistType.Likes,
        CreatedAt = now,
    };
}
