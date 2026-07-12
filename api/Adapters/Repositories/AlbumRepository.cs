using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class AlbumRepository : IAlbumRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public AlbumRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<Album>> GetAlbumsAsync(string ownerUsername, int pageSize, string? cursor)
    {
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumDataModel>(
            hashKey: $"ALBUMS#{ownerUsername}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        return new PaginatedResult<Album>
        {
            Items = items.Select(item => ToAlbum(item)).ToList(),
            NextCursor = nextToken,
        };
    }

    public async Task<Album?> GetAlbumByIdAsync(string albumId)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var items = await _dynamoDbService.QueryAsync<AlbumDataModel>(
            hashKey: $"ALBUM#{normalisedId}",
            rangeKey: "INFO",
            queryOperator: QueryOperator.Equal,
            indexName: "GSI1");

        var item = items.FirstOrDefault();
        return item is null ? null : ToAlbum(item);
    }

    public async Task<Album> CreateAlbumAsync(string ownerUsername, string name, string? description,
        IReadOnlyList<string> trackIds)
    {
        var albumId = Guid.NewGuid().ToString("N").ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Memberships first, meta last — the album only becomes visible once fully written
        if (trackIds.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
            foreach (var trackId in trackIds)
                membershipBatch.AddPutItem(BuildMembership(albumId, trackId, ownerUsername, now));

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        var meta = new AlbumDataModel
        {
            Pk = $"USER#{ownerUsername}",
            Sk = $"ALBUM#{albumId}",
            Gsi1Pk = $"ALBUM#{albumId}",
            Gsi1Sk = "INFO",
            Gsi3Pk = $"ALBUMS#{ownerUsername}",
            Gsi3Sk = $"DATE#{now}",
            Name = name,
            Description = description,
            CreatedAt = now,
        };
        await _dynamoDbService.WriteToDynamoAsync(meta);

        return ToAlbum(meta);
    }

    public async Task<Album?> UpdateAlbumAsync(string ownerUsername, string albumId, string? name,
        string? description)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var builder = new UpdateExpressionBuilder();
        builder.AddNullableString("name", "n", name);
        builder.AddNullableString("description", "d", description);

        if (!builder.IsEmpty)
        {
            var tx = _dynamoDbService.CreateTransactionPart<AlbumDataModel>();
            tx.AddSaveItem($"USER#{ownerUsername}", $"ALBUM#{normalisedId}", builder.Build());
            await _dynamoDbService.ExecuteTransactWriteAsync(tx);
        }

        var item = await _dynamoDbService.GetFromDynamoAsync<AlbumDataModel>(
            $"USER#{ownerUsername}", $"ALBUM#{normalisedId}"
            );
        
        return item is null ? null : ToAlbum(item);
    }

    public async Task DeleteAlbumAsync(string ownerUsername, string albumId)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var membershipsTask = GetMembershipsAsync(normalisedId);
        var sharesTask = GetSharesAsync(normalisedId);
        await Task.WhenAll(membershipsTask, sharesTask);

        var memberships = membershipsTask.Result;
        var shares = sharesTask.Result;

        // Revoke derived access first so a mid-delete crash never leaves hidden grants behind
        await DeleteGrantsAsync(memberships.Select(m => m.TrackId).ToList(),
            shares.Select(s => s.Recipient).ToList(), normalisedId);

        if (shares.Count > 0)
        {
            var shareBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            
            foreach (var share in shares)
                shareBatch.AddDeleteItem(share);
            
            await _dynamoDbService.ExecuteBatchWriteAsync(shareBatch);
        }

        if (memberships.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
            
            foreach (var membership in memberships)
                membershipBatch.AddDeleteItem(membership);
            
            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        var metaBatch = _dynamoDbService.CreateBatchWritePart<AlbumDataModel>();
        metaBatch.AddDeleteKey($"USER#{ownerUsername}", $"ALBUM#{normalisedId}");
        
        await _dynamoDbService.ExecuteBatchWriteAsync(metaBatch);
    }

    public async Task<PaginatedResult<Track>> GetAlbumTracksAsync(string albumId, int pageSize, string? cursor)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var (memberships, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumTrackDataModel>(
            hashKey: $"ALBUM#{normalisedId}",
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

    public async Task<List<string>> GetAlbumTrackIdsAsync(string albumId)
    {
        var memberships = await GetMembershipsAsync(albumId.ToLowerInvariant());
        return memberships.Select(m => m.TrackId).ToList();
    }

    public async Task AddTracksAsync(string albumId, string ownerUsername, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return;

        var normalisedId = albumId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Grants to existing recipients first, memberships last
        var recipients = await GetAlbumRecipientsAsync(normalisedId);
        await WriteGrantsAsync(trackIds, recipients, normalisedId, ownerUsername, now);

        var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
        foreach (var trackId in trackIds)
            membershipBatch.AddPutItem(BuildMembership(normalisedId, trackId, ownerUsername, now));

        await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
    }

    public async Task RemoveTrackFromAllAlbumsAsync(string ownerUsername, string trackId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        // Memberships are keyed by album (ALBUM#{id} / TRACK#{id}), so finding the
        // albums containing a track means checking each of the owner's albums —
        // albums only ever contain the owner's own tracks. Needs the full set, so
        // it reads the base table rather than the paginated GSI3 listing.
        var albums = await _dynamoDbService.QueryAsync<AlbumDataModel>(
            $"USER#{ownerUsername}",
            "ALBUM#",
            QueryOperator.BeginsWith);

        foreach (var album in albums)
        {
            var membership = await _dynamoDbService.GetFromDynamoAsync<AlbumTrackDataModel>(
                $"ALBUM#{album.AlbumId}", $"TRACK#{normalisedTrackId}");

            if (membership is not null)
                await RemoveTracksAsync(album.AlbumId, [normalisedTrackId]);
        }
    }

    public async Task RemoveTracksAsync(string albumId, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return;

        var normalisedId = albumId.ToLowerInvariant();

        // Revoke grants first, memberships last
        var recipients = await GetAlbumRecipientsAsync(normalisedId);
        await DeleteGrantsAsync(trackIds, recipients, normalisedId);

        var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
        foreach (var trackId in trackIds)
            membershipBatch.AddDeleteKey($"ALBUM#{normalisedId}", $"TRACK#{trackId.ToLowerInvariant()}");

        await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
    }

    public async Task<bool> IsAlbumSharedWithUserAsync(string albumId, string username)
    {
        var share = await _dynamoDbService.GetFromDynamoAsync<AlbumShareDataModel>(
            $"ALBUM#{albumId.ToLowerInvariant()}", $"SHARED#{username}");
        return share is not null;
    }

    public async Task<List<string>> GetAlbumRecipientsAsync(string albumId)
    {
        var shares = await GetSharesAsync(albumId.ToLowerInvariant());
        return shares.Select(s => s.Recipient).ToList();
    }

    public async Task ShareAlbumAsync(string albumId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients)
    {
        var normalisedId = albumId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var trackIds = await GetAlbumTrackIdsAsync(normalisedId);

        // Unshares: revoke grants first, then remove the share records
        if (removeRecipients.Count > 0)
        {
            await DeleteGrantsAsync(trackIds, removeRecipients, normalisedId);

            var removeBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            foreach (var recipient in removeRecipients)
                removeBatch.AddDeleteKey($"ALBUM#{normalisedId}", $"SHARED#{recipient}");
            await _dynamoDbService.ExecuteBatchWriteAsync(removeBatch);
        }

        // Shares: write grants first, then the share records (the share is the authoritative marker)
        if (addRecipients.Count > 0)
        {
            await WriteGrantsAsync(trackIds, addRecipients, normalisedId, ownerUsername, now);

            var addBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            foreach (var recipient in addRecipients)
            {
                addBatch.AddPutItem(new AlbumShareDataModel
                {
                    Pk = $"ALBUM#{normalisedId}",
                    Sk = $"SHARED#{recipient}",
                    Gsi1Pk = $"ALBUMSHARED#{recipient}",
                    Gsi1Sk = $"DATE#{now}",
                    AlbumOwnerUsername = ownerUsername,
                    SharedAt = now,
                });
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(addBatch);
        }
    }

    public async Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedWithUserAsync(string username, int pageSize,
        string? cursor)
    {
        var (shares, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumShareDataModel>(
            hashKey: $"ALBUMSHARED#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (shares.Count == 0)
            return new PaginatedResult<SharedAlbum> { Items = [], NextCursor = null };

        var albumKeys = shares.Select(s => (pk: $"USER#{s.AlbumOwnerUsername}", sk: $"ALBUM#{s.AlbumId}"));
        var ownerKeys = shares
            .Select(s => s.AlbumOwnerUsername)
            .Distinct()
            .Select(owner => (pk: $"USER#{owner}", sk: "PROFILE"));

        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(albumKeys);
        var ownersTask = _dynamoDbService.BatchGetAsync<UserDataModel>(ownerKeys);
        await Task.WhenAll(albumsTask, ownersTask);

        var albums = albumsTask.Result.ToDictionary(a => a.AlbumId);
        var owners = ownersTask.Result.ToDictionary(u => u.Username);

        var sharedAlbums = shares
            .Where(s => albums.ContainsKey(s.AlbumId) && owners.ContainsKey(s.AlbumOwnerUsername))
            .Select(s => new SharedAlbum
            {
                Album = ToAlbum(albums[s.AlbumId], owners[s.AlbumOwnerUsername]),
                SharedAt = s.SharedAt,
            })
            .ToList();

        return new PaginatedResult<SharedAlbum> { Items = sharedAlbums, NextCursor = nextToken };
    }

    private Task<List<AlbumTrackDataModel>> GetMembershipsAsync(string normalisedAlbumId)
    {
        return _dynamoDbService.QueryAsync<AlbumTrackDataModel>(
            $"ALBUM#{normalisedAlbumId}",
            "TRACK#",
            QueryOperator.BeginsWith);
    }

    private Task<List<AlbumShareDataModel>> GetSharesAsync(string normalisedAlbumId)
    {
        return _dynamoDbService.QueryAsync<AlbumShareDataModel>(
            $"ALBUM#{normalisedAlbumId}",
            "SHARED#",
            QueryOperator.BeginsWith);
    }

    private Task WriteGrantsAsync(IReadOnlyList<string> trackIds, IReadOnlyList<string> recipients,
        string normalisedAlbumId, string trackOwnerUsername, long now)
    {
        if (trackIds.Count == 0 || recipients.Count == 0)
            return Task.CompletedTask;

        var batch = _dynamoDbService.CreateBatchWritePart<AlbumTrackGrantDataModel>();
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

        return _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    private Task DeleteGrantsAsync(IReadOnlyList<string> trackIds, IReadOnlyList<string> recipients,
        string normalisedAlbumId)
    {
        if (trackIds.Count == 0 || recipients.Count == 0)
            return Task.CompletedTask;

        var batch = _dynamoDbService.CreateBatchWritePart<AlbumTrackGrantDataModel>();
        foreach (var trackId in trackIds)
        foreach (var recipient in recipients)
        {
            batch.AddDeleteKey($"TRACK#{trackId.ToLowerInvariant()}",
                AlbumTrackGrantDataModel.BuildSk(recipient, normalisedAlbumId));
        }

        return _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    private static AlbumTrackDataModel BuildMembership(string normalisedAlbumId, string trackId,
        string ownerUsername, long now) => new()
    {
        Pk = $"ALBUM#{normalisedAlbumId}",
        Sk = $"TRACK#{trackId.ToLowerInvariant()}",
        Gsi1Pk = $"ALBUM#{normalisedAlbumId}",
        Gsi1Sk = $"DATE#{now}",
        TrackOwnerUsername = ownerUsername,
        AddedAt = now,
    };

    private static Album ToAlbum(AlbumDataModel item, User? owner = null) => new()
    {
        Id = item.AlbumId,
        Name = item.Name,
        Description = item.Description,
        CreatedAt = item.CreatedAt,
        Owner = owner,
        OwnerUsername = item.OwnerUsername,
    };
}
