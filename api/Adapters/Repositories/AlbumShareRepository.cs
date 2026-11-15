using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class AlbumShareRepository : IAlbumShareRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public AlbumShareRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<bool> IsAlbumSharedWithUserAsync(string albumId, string username) =>
        await GetShareAsync(albumId, username) is not null;

    public async Task<ShareNote?> GetShareAsync(string albumId, string username)
    {
        var share = await _dynamoDbService.GetFromDynamoAsync<AlbumShareDataModel>(
            $"ALBUM#{albumId.ToLowerInvariant()}", $"SHARED#{username}");
        return share is null ? null : new ShareNote { SharedAt = share.SharedAt, Caption = share.Caption };
    }

    public async Task<List<string>> GetAlbumRecipientsAsync(string albumId)
    {
        var shares = await AlbumRecords.GetSharesAsync(_dynamoDbService, albumId.ToLowerInvariant());
        return shares.Select(s => s.Recipient).ToList();
    }

    public async Task ShareAlbumAsync(string albumId, string ownerUsername, IReadOnlyList<string> addRecipients,
        IReadOnlyList<string> removeRecipients, string? caption, bool notifyRecipients = true)
    {
        var normalisedId = albumId.ToLowerInvariant();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var membershipsTask = AlbumRecords.GetMembershipsAsync(_dynamoDbService, normalisedId);
        var sharesTask = AlbumRecords.GetSharesAsync(_dynamoDbService, normalisedId);
        await Task.WhenAll(membershipsTask, sharesTask);

        var trackIds = membershipsTask.Result.Select(m => m.TrackId).ToList();
        var existingByRecipient = sharesTask.Result
            .ToDictionary(s => s.Recipient, s => s, StringComparer.OrdinalIgnoreCase);

        // A recipient in both add and remove is contradictory — let remove win.
        var removeSet = new HashSet<string>(removeRecipients, StringComparer.OrdinalIgnoreCase);
        var adds = addRecipients.Where(r => !removeSet.Contains(r)).ToList();

        // Grants + counter only for genuinely-new recipients; every add is (re)written below
        // (a re-share overwrites the record with the current caption + a fresh timestamp).
        var newRecipients = adds
            .Where(r => !existingByRecipient.ContainsKey(r))
            .ToList();

        // Resolve removals to the stored recipient spelling: keys are case-sensitive, so
        // deleting with the request's casing ("bob" for a stored "Bob") would miss every
        // record while still counting as removed. Non-recipients drop out here too.
        var removes = removeRecipients
            .Select(r => existingByRecipient.GetValueOrDefault(r)?.Recipient)
            .OfType<string>()
            .Distinct()
            .ToList();

        if (removes.Count > 0)
        {
            await AlbumRecords.DeleteGrantsAsync(_dynamoDbService, trackIds, removes, normalisedId);
            await DeleteShareRecordsAsync(normalisedId, removes);
        }

        if (newRecipients.Count > 0)
            await AlbumRecords.WriteGrantsAsync(_dynamoDbService, trackIds, newRecipients, normalisedId,
                ownerUsername, now);

        if (adds.Count > 0)
        {
            var addBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
            var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
            foreach (var recipient in adds)
            {
                addBatch.AddPutItem(new AlbumShareDataModel
                {
                    Pk = $"ALBUM#{normalisedId}",
                    Sk = $"SHARED#{recipient}",
                    Gsi1Pk = $"ALBUMSHARED#{recipient}",
                    Gsi1Sk = $"DATE#{now}",
                    Gsi2Sk = $"SENDER#{ownerUsername}#DATE#{now}",
                    AlbumOwnerUsername = ownerUsername,
                    Caption = caption,
                    SharedAt = now,
                    // Recipients' "shared with you" activity follows from this record
                    // (ActivityEvents) — except a share-link accept, their own doing
                    Via = notifyRecipients ? null : ShareVia.Link,
                });
                feedBatch.AddPutItem(
                    FeedItems.Build(recipient, FeedItemType.Album, normalisedId, ownerUsername, now, caption));
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(addBatch, feedBatch);
        }

        var shareDelta = newRecipients.Count - removes.Count;
        if (shareDelta != 0)
            await AlbumRecords.UpdateCountersAsync(_dynamoDbService, ownerUsername, normalisedId,
                ("shareCount", shareDelta));
    }

    // Recipient-side "remove from my library": revokes only the caller's own access to this
    // album (share record + this-recipient track grants + feed item) and decrements the owner's
    // shareCount. It never touches direct SHARED#{user} track records, so a track that was also
    // shared directly stays accessible. Idempotent — a no-op if the caller has no album share.
    public async Task RemoveAlbumFromLibraryAsync(string albumId, string username)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var share = await _dynamoDbService.GetFromDynamoAsync<AlbumShareDataModel>(
            $"ALBUM#{normalisedId}", $"SHARED#{username}");
        if (share is null) return;

        // Revoke grants first, then the share + feed records (retryable order: a dangling
        // grant just leaves stale access, a dangling share record leaks a phantom library entry).
        var memberships = await AlbumRecords.GetMembershipsAsync(_dynamoDbService, normalisedId);
        await AlbumRecords.DeleteGrantsAsync(_dynamoDbService, memberships.Select(m => m.TrackId).ToList(),
            [username], normalisedId);

        var shareTx = _dynamoDbService.CreateTransactionPart<AlbumShareDataModel>();
        shareTx.AddDeleteKey($"ALBUM#{normalisedId}", $"SHARED#{username}", ConditionExpressions.ItemExists());
        var feedTx = _dynamoDbService.CreateTransactionPart<FeedItemDataModel>();
        var (fpk, fsk) = FeedItems.Key(username, FeedItemType.Album, normalisedId);
        feedTx.AddDeleteKey(fpk, fsk);

        var parts = new List<ITransactWrite> { shareTx, feedTx };

        // shareCount tracks the number of album-share records, so a self-removal decrements it
        // (kept in sync with the re-share upsert, which counts a missing record as new).
        if (!string.IsNullOrEmpty(share.AlbumOwnerUsername))
            parts.Add(AlbumRecords.CounterUpdate(_dynamoDbService, share.AlbumOwnerUsername, normalisedId,
                ("shareCount", -1)));

        await _dynamoDbService.TryExecuteTransactWriteAsync(parts.ToArray());
    }

    public async Task<List<Recipient>> GetAlbumRecipientDetailsAsync(string albumId)
    {
        var shares = await AlbumRecords.GetSharesAsync(_dynamoDbService, albumId.ToLowerInvariant());
        if (shares.Count == 0)
            return [];

        var profiles = await ProfileLookup.GetAsync(_dynamoDbService, shares.Select(s => s.Recipient));

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

        return await HydrateSharedAlbumsAsync(shares, username, nextToken);
    }

    public async Task<PaginatedResult<SharedAlbum>> GetAlbumsSharedFromUserAsync(string senderUsername,
        string viewerUsername, int pageSize, string? cursor)
    {
        var (shares, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumShareDataModel>(
            hashKey: $"ALBUMSHARED#{viewerUsername}",
            rangeKey: $"SENDER#{senderUsername}#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI2",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        return await HydrateSharedAlbumsAsync(shares, viewerUsername, nextToken);
    }

    // Album metas + owner profiles + the viewer's like status, in one parallel BatchGet round
    private async Task<PaginatedResult<SharedAlbum>> HydrateSharedAlbumsAsync(List<AlbumShareDataModel> shares,
        string viewerUsername, string? nextToken)
    {
        if (shares.Count == 0)
            return new PaginatedResult<SharedAlbum> { Items = [], NextCursor = null };

        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(
            shares.Select(s => Keys.Album(s.AlbumOwnerUsername, s.AlbumId)));
        var ownersTask = ProfileLookup.GetAsync(_dynamoDbService, shares.Select(s => s.AlbumOwnerUsername));
        var likedAlbumIdsTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(
            _dynamoDbService, viewerUsername, shares.Select(s => s.AlbumId).ToList());
        await Task.WhenAll(albumsTask, ownersTask, likedAlbumIdsTask);

        var albums = albumsTask.Result.ToDictionary(a => a.AlbumId);
        var owners = ownersTask.Result;

        var sharedAlbums = shares
            .Where(s => albums.ContainsKey(s.AlbumId) && owners.ContainsKey(s.AlbumOwnerUsername))
            .Select(s => new SharedAlbum
            {
                Album = AlbumSummary.From(albums[s.AlbumId], owners[s.AlbumOwnerUsername],
                    likedAlbumIdsTask.Result.Contains(s.AlbumId)),
                SharedAt = s.SharedAt,
                Caption = s.Caption,
            })
            .ToList();

        return new PaginatedResult<SharedAlbum> { Items = sharedAlbums, NextCursor = nextToken };
    }

    public async Task DeleteAllSharesAsync(string albumId)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var membershipsTask = AlbumRecords.GetMembershipsAsync(_dynamoDbService, normalisedId);
        var sharesTask = AlbumRecords.GetSharesAsync(_dynamoDbService, normalisedId);
        await Task.WhenAll(membershipsTask, sharesTask);

        var recipients = sharesTask.Result.Select(s => s.Recipient).ToList();
        if (recipients.Count == 0)
            return;

        await AlbumRecords.DeleteGrantsAsync(_dynamoDbService,
            membershipsTask.Result.Select(m => m.TrackId).ToList(), recipients, normalisedId);
        await DeleteShareRecordsAsync(normalisedId, recipients);
    }

    // Share records + their feed items, for recipients spelt as stored
    private Task DeleteShareRecordsAsync(string normalisedId, IReadOnlyList<string> recipients)
    {
        var shareBatch = _dynamoDbService.CreateBatchWritePart<AlbumShareDataModel>();
        var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
        foreach (var recipient in recipients)
        {
            shareBatch.AddDeleteKey($"ALBUM#{normalisedId}", $"SHARED#{recipient}");
            var (fpk, fsk) = FeedItems.Key(recipient, FeedItemType.Album, normalisedId);
            feedBatch.AddDeleteKey(fpk, fsk);
        }

        return _dynamoDbService.ExecuteBatchWriteAsync(shareBatch, feedBatch);
    }
}
