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

    public async Task<PaginatedResult<AlbumSummary>> GetAlbumsAsync(string ownerUsername, int pageSize, string? cursor)
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

        if (items.Count == 0)
            return new PaginatedResult<AlbumSummary> { Items = [], NextCursor = null };

        var ownerTask = _dynamoDbService.GetFromDynamoAsync<UserDataModel>($"USER#{ownerUsername}", "PROFILE");
        
        // likedAlbumIdsTask is for checking if the user's own album is liked by themselves
        var likedAlbumIdsTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(
            _dynamoDbService, ownerUsername, items.Select(i => i.AlbumId).ToList());
        
        await Task.WhenAll(ownerTask, likedAlbumIdsTask);

        var owner = ownerTask.Result;
        if (owner is null)
            return new PaginatedResult<AlbumSummary> { Items = [], NextCursor = null };

        return new PaginatedResult<AlbumSummary>
        {
            Items = items.Select(item => AlbumSummary.From(item, owner, likedAlbumIdsTask.Result.Contains(item.AlbumId)))
                .ToList(),
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

    public async Task<Album> CreateAlbumAsync(string albumId, string ownerUsername, string name, string? description,
        ImageProcessingResult? image, IReadOnlyList<string> trackIds)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var durations = await GetTrackDurationsAsync(ownerUsername, trackIds);

        // Memberships first, meta last — the album only becomes visible once fully written
        if (trackIds.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
            var rank = 0;
            foreach (var trackId in trackIds)
            {
                rank += MembershipRank.Gap;
                membershipBatch.AddPutItem(BuildMembership(albumId, trackId, ownerUsername, now, rank,
                    durations.GetValueOrDefault(trackId.ToLowerInvariant())));
            }

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
            ImageUrl = image?.ImageUrl,
            ImageBgColor = image?.ImageHex,
            TrackCount = trackIds.Count,
            TotalDurationSeconds = durations.Values.Sum(),
            CreatedAt = now,
        };
        await _dynamoDbService.WriteToDynamoAsync(meta);

        return ToAlbum(meta);
    }

    public async Task<Album?> UpdateAlbumAsync(string ownerUsername, string albumId, string? name,
        string? description, ImageProcessingResult? image, bool clearImage)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var builder = new UpdateExpressionBuilder();
        builder.AddNullableString("name", "n", name);
        builder.AddNullableString("description", "d", description);

        if (image is not null)
        {
            builder.AddValue("imageUrl", "iu", image.ImageUrl);
            builder.AddNullableString("imageBgColor", "ib", image.ImageHex);
        }
        else if (clearImage)
        {
            builder.RemoveField("imageUrl", "iu");
            builder.RemoveField("imageBgColor", "ib");
        }

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
        var likesTask = _dynamoDbService.QueryAsync<AlbumLikeDataModel>(
            $"ALBUM#{normalisedId}", "LIKE#", QueryOperator.BeginsWith);
        await Task.WhenAll(membershipsTask, sharesTask, likesTask);

        var memberships = membershipsTask.Result;
        var shares = sharesTask.Result;
        var likes = likesTask.Result;

        // Revoke derived access first so a mid-delete crash never leaves hidden grants behind
        await DeleteGrantsAsync(memberships.Select(m => m.TrackId).ToList(),
            shares.Select(s => s.Recipient).ToList(), normalisedId);

        if (likes.Count > 0)
        {
            var likeBatch = _dynamoDbService.CreateBatchWritePart<AlbumLikeDataModel>();
            foreach (var like in likes)
                likeBatch.AddDeleteItem(like);
            await _dynamoDbService.ExecuteBatchWriteAsync(likeBatch);
        }

        if (shares.Count > 0)
        {
            var shareBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();

            foreach (var share in shares)
            {
                shareBatch.AddDeleteItem(share);
                var (fpk, fsk) = FeedItems.Key(share.Recipient, FeedItemType.Album, normalisedId);
                feedBatch.AddDeleteKey(fpk, fsk);
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(shareBatch, feedBatch);
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
        var memberships = await GetMembershipsAsync(albumId.ToLowerInvariant());
        return memberships.Select(m => m.TrackId).ToList();
    }

    public async Task<(int Added, int Removed)> SetTracksAsync(string albumId, string ownerUsername,
        IReadOnlyList<string> orderedTrackIds)
    {
        var normalisedId = albumId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var membershipsTask = GetMembershipsAsync(normalisedId);
        var recipientsTask = GetAlbumRecipientsAsync(normalisedId);
        await Task.WhenAll(membershipsTask, recipientsTask);

        var byId = membershipsTask.Result.ToDictionary(m => m.TrackId, StringComparer.OrdinalIgnoreCase);
        var recipients = recipientsTask.Result;

        var keep = orderedTrackIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var addedIds = orderedTrackIds.Where(id => !byId.ContainsKey(id)).ToList();
        var removed = membershipsTask.Result.Where(m => !keep.Contains(m.TrackId)).ToList();

        // Grants first (revoke dropped, then grant new), memberships after, counters
        // last — the save is declarative, so a partial failure is fixed by the
        // client retrying the same PUT
        await DeleteGrantsAsync(removed.Select(m => m.TrackId).ToList(), recipients, normalisedId);
        await WriteGrantsAsync(addedIds, recipients, normalisedId, ownerUsername, now);

        var durations = await GetTrackDurationsAsync(ownerUsername, addedIds);

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
                    membershipBatch.AddPutItem(BuildMembership(normalisedId, trackId, ownerUsername, now, rank,
                        durations.GetValueOrDefault(trackId)));
                }
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        if (addedIds.Count > 0 || removed.Count > 0)
            await UpdateAlbumCountersAsync(ownerUsername, normalisedId,
                ("trackCount", addedIds.Count - removed.Count),
                ("totalDurationSeconds",
                    addedIds.Sum(id => (long)durations.GetValueOrDefault(id))
                    - removed.Sum(m => (long)m.Duration)));

        return (addedIds.Count, removed.Count);
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
                await RemoveTracksAsync(album.AlbumId, ownerUsername, [normalisedTrackId]);
        }
    }

    // Track deletion path only — API-driven removals go through SetTracksAsync
    private async Task RemoveTracksAsync(string albumId, string ownerUsername, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return;

        var normalisedId = albumId.ToLowerInvariant();

        // Revoke grants first, memberships last
        var recipients = await GetAlbumRecipientsAsync(normalisedId);
        await DeleteGrantsAsync(trackIds, recipients, normalisedId);

        // Only actual members count toward the decrement; duration comes from the
        // membership so removal works even mid-track-deletion
        var existing = await GetExistingMembershipsAsync(normalisedId, trackIds);

        var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
        foreach (var trackId in trackIds)
            membershipBatch.AddDeleteKey($"ALBUM#{normalisedId}", $"TRACK#{trackId.ToLowerInvariant()}");

        await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);

        if (existing.Count > 0)
            await UpdateAlbumCountersAsync(ownerUsername, normalisedId,
                ("trackCount", -existing.Count),
                ("totalDurationSeconds", -existing.Values.Sum(m => (long)m.Duration)));
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

        // Unshares: revoke grants first, then remove the share + feed records
        if (removeRecipients.Count > 0)
        {
            await DeleteGrantsAsync(trackIds, removeRecipients, normalisedId);

            var removeBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
            foreach (var recipient in removeRecipients)
            {
                removeBatch.AddDeleteKey($"ALBUM#{normalisedId}", $"SHARED#{recipient}");
                var (fpk, fsk) = FeedItems.Key(recipient, FeedItemType.Album, normalisedId);
                feedBatch.AddDeleteKey(fpk, fsk);
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(removeBatch, feedBatch);
        }

        // Shares: write grants first, then the share records (the share is the authoritative marker)
        if (addRecipients.Count > 0)
        {
            await WriteGrantsAsync(trackIds, addRecipients, normalisedId, ownerUsername, now);

            var addBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
            var activityBatch = _dynamoDbService.CreateBatchWritePart<ActivityItemDataModel>();
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
                feedBatch.AddPutItem(
                    FeedItems.Build(recipient, FeedItemType.Album, normalisedId, ownerUsername, now));
                activityBatch.AddPutItem(ActivityItems.Build(recipient, ActivityType.AlbumShared, ownerUsername,
                    FeedItemType.Album, normalisedId, now));
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(addBatch, feedBatch, activityBatch);
        }

        // Callers pre-filter adds to new recipients and removes to current ones
        var shareDelta = addRecipients.Count - removeRecipients.Count;
        if (shareDelta != 0)
            await UpdateAlbumCountersAsync(ownerUsername, normalisedId, ("shareCount", shareDelta));
    }

    public async Task<List<Recipient>> GetAlbumRecipientDetailsAsync(string albumId)
    {
        var shares = await GetSharesAsync(albumId.ToLowerInvariant());
        if (shares.Count == 0)
            return [];

        var keys = shares
            .Select(s => s.Recipient)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var profiles = (await _dynamoDbService.BatchGetAsync<UserDataModel>(keys))
            .ToDictionary(p => p.Username, StringComparer.OrdinalIgnoreCase);

        return shares
            .Where(s => profiles.ContainsKey(s.Recipient))
            .Select(s => new Recipient { User = UserSummary.From(profiles[s.Recipient]), SharedAt = s.SharedAt })
            .OrderByDescending(r => r.SharedAt)
            .ToList();
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
        var likedAlbumIdsTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(
            _dynamoDbService, username, shares.Select(s => s.AlbumId).ToList());
        await Task.WhenAll(albumsTask, ownersTask, likedAlbumIdsTask);

        var albums = albumsTask.Result.ToDictionary(a => a.AlbumId);
        var owners = ownersTask.Result.ToDictionary(u => u.Username);

        var sharedAlbums = shares
            .Where(s => albums.ContainsKey(s.AlbumId) && owners.ContainsKey(s.AlbumOwnerUsername))
            .Select(s => new SharedAlbum
            {
                Album = AlbumSummary.From(albums[s.AlbumId], owners[s.AlbumOwnerUsername],
                    likedAlbumIdsTask.Result.Contains(s.AlbumId)),
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

    private async Task<Dictionary<string, int>> GetTrackDurationsAsync(string ownerUsername,
        IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return [];

        var keys = trackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => (pk: $"USER#{ownerUsername}", sk: $"TRACK#{id}"));
        var tracks = await _dynamoDbService.BatchGetAsync<TrackDataModel>(keys);

        return tracks.ToDictionary(t => t.TrackId, t => t.Duration);
    }

    private async Task<Dictionary<string, AlbumTrackDataModel>> GetExistingMembershipsAsync(
        string normalisedAlbumId, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return [];

        var keys = trackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => (pk: $"ALBUM#{normalisedAlbumId}", sk: $"TRACK#{id}"));
        var memberships = await _dynamoDbService.BatchGetAsync<AlbumTrackDataModel>(keys);

        return memberships.ToDictionary(m => m.TrackId, StringComparer.OrdinalIgnoreCase);
    }

    private Task UpdateAlbumCountersAsync(string ownerUsername, string normalisedAlbumId,
        params (string Attribute, long Delta)[] deltas)
    {
        var tx = _dynamoDbService.CreateTransactionPart<AlbumDataModel>();
        tx.AddSaveItem($"USER#{ownerUsername}", $"ALBUM#{normalisedAlbumId}", CounterExpressions.Add(deltas));
        return _dynamoDbService.ExecuteTransactWriteAsync(tx);
    }

    private static Album ToAlbum(AlbumDataModel item, User? owner = null) => new()
    {
        Id = item.AlbumId,
        Name = item.Name,
        Description = item.Description,
        ImageUrl = item.ImageUrl,
        ImageBgColor = item.ImageBgColor,
        TrackCount = item.TrackCount,
        TotalDurationSeconds = item.TotalDurationSeconds,
        ShareCount = item.ShareCount, // handlers null share/like counts for non-owners
        LikeCount = item.LikeCount,
        CreatedAt = item.CreatedAt,
        Owner = owner is null ? null : UserSummary.From(owner),
        OwnerUsername = item.OwnerUsername,
    };
}