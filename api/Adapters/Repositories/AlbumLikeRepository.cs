using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class AlbumLikeRepository : IAlbumLikeRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public AlbumLikeRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task LikeAlbumAsync(string albumId, string username, string albumOwnerUsername)
    {
        var normalisedId = albumId.ToLowerInvariant();

        if (await GetLikeAsync(normalisedId, username) is not null)
            return; // read-before-write: liking twice must not double-increment

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var likeTx = _dynamoDbService.CreateTransactionPart<AlbumLikeDataModel>();
        likeTx.AddSaveItem(new AlbumLikeDataModel
        {
            Pk = $"ALBUM#{normalisedId}",
            Sk = $"LIKE#{username}",
            Gsi1Pk = $"ALBUMLIKES#{username}",
            Gsi1Sk = $"DATE#{now}",
            AlbumOwnerUsername = albumOwnerUsername,
            LikedAt = now,
        });

        var counterTx = CreateLikeCountUpdate(normalisedId, albumOwnerUsername, 1);

        if (!string.Equals(username, albumOwnerUsername, StringComparison.OrdinalIgnoreCase))
        {
            var activityTx = _dynamoDbService.CreateTransactionPart<ActivityItemDataModel>();
            activityTx.AddSaveItem(ActivityItems.Build(albumOwnerUsername, ActivityType.AlbumLiked, username,
                FeedItemType.Album, normalisedId, now));
            await _dynamoDbService.ExecuteTransactWriteAsync(likeTx, counterTx, activityTx);
            return;
        }

        await _dynamoDbService.ExecuteTransactWriteAsync(likeTx, counterTx);
    }

    public async Task UnlikeAlbumAsync(string albumId, string username, string albumOwnerUsername)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var existing = await GetLikeAsync(normalisedId, username);
        if (existing is null)
            return;

        var likeTx = _dynamoDbService.CreateTransactionPart<AlbumLikeDataModel>();
        likeTx.AddDeleteItem(existing);

        await _dynamoDbService.ExecuteTransactWriteAsync(likeTx, CreateLikeCountUpdate(normalisedId, albumOwnerUsername, -1));
    }

    public async Task<bool> IsAlbumLikedByUserAsync(string albumId, string username)
    {
        return await GetLikeAsync(albumId.ToLowerInvariant(), username) is not null;
    }

    // Which of these albums has the viewer liked
    internal static async Task<HashSet<string>> GetLikedAlbumIdsAsync(
        IDynamoDBService dynamoDbService,
        string viewerUsername,
        IReadOnlyCollection<string> albumIds)
    {
        if (albumIds.Count == 0)
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var keys = albumIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => (pk: $"ALBUM#{id}", sk: $"LIKE#{viewerUsername}"));

        var likes = await dynamoDbService.BatchGetAsync<AlbumLikeDataModel>(keys);
        return likes.Select(l => l.AlbumId).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public async Task<PaginatedResult<AlbumSummary>> GetLikedAlbumsAsync(string username, int pageSize, string? cursor)
    {
        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumLikeDataModel>(
            hashKey: $"ALBUMLIKES#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<AlbumSummary> { Items = [], NextCursor = null };

        var albumKeys = likes.Select(l => (pk: $"USER#{l.AlbumOwnerUsername}", sk: $"ALBUM#{l.AlbumId}"));
        var ownerKeys = likes.Select(l => l.AlbumOwnerUsername).Distinct()
            .Select(o => (pk: $"USER#{o}", sk: "PROFILE"));

        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(albumKeys);
        var ownersTask = _dynamoDbService.BatchGetAsync<UserDataModel>(ownerKeys);
        await Task.WhenAll(albumsTask, ownersTask);

        var albums = albumsTask.Result.ToDictionary(a => a.AlbumId, StringComparer.OrdinalIgnoreCase);
        var owners = ownersTask.Result.ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);

        var items = likes
            .Where(l => albums.ContainsKey(l.AlbumId) && owners.ContainsKey(l.AlbumOwnerUsername))
            .Select(l => AlbumSummary.From(albums[l.AlbumId], owners[l.AlbumOwnerUsername], likedByMe: true))
            .ToList();

        return new PaginatedResult<AlbumSummary> { Items = items, NextCursor = nextToken };
    }

    public async Task<PaginatedResult<AlbumLiker>> GetAlbumLikersAsync(string albumId, int pageSize, string? cursor)
    {
        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumLikeDataModel>(
            hashKey: $"ALBUM#{albumId.ToLowerInvariant()}",
            rangeKey: "LIKE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<AlbumLiker> { Items = [], NextCursor = null };

        var profileKeys = likes
            .Select(l => l.LikerUsername)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        
        var profiles = (await _dynamoDbService.BatchGetAsync<UserDataModel>(profileKeys))
            .ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);

        var likers = likes
            .Where(l => profiles.ContainsKey(l.LikerUsername))
            .Select(l => new AlbumLiker { User = UserSummary.From(profiles[l.LikerUsername]), LikedAt = l.LikedAt })
            .ToList();

        return new PaginatedResult<AlbumLiker> { Items = likers, NextCursor = nextToken };
    }

    private Task<AlbumLikeDataModel?> GetLikeAsync(string normalisedAlbumId, string username)
    {
        return _dynamoDbService.GetFromDynamoAsync<AlbumLikeDataModel>(
            $"ALBUM#{normalisedAlbumId}", $"LIKE#{username}");
    }

    private ITransactWrite CreateLikeCountUpdate(string normalisedAlbumId, string albumOwnerUsername, int delta)
    {
        var tx = _dynamoDbService.CreateTransactionPart<AlbumDataModel>();
        tx.AddSaveItem(
            $"USER#{albumOwnerUsername}",
            $"ALBUM#{normalisedAlbumId}",
            CounterExpressions.Add(("likeCount", delta)));
        return tx;
    }
}
