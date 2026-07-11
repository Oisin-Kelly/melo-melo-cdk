using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports;

namespace Adapters;

public sealed class LikeRepository : ILikeRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public LikeRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task LikeTrackAsync(string trackId, string username, string trackOwnerUsername)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        // Read-before-write: liking twice must not double-increment likeCount
        var existing = await GetLikeAsync(normalisedTrackId, username);
        if (existing is not null)
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var likeTx = _dynamoDbService.CreateTransactionPart<LikeDataModel>();
        likeTx.AddSaveItem(new LikeDataModel
        {
            Pk = $"TRACK#{normalisedTrackId}",
            Sk = $"LIKE#{username}",
            Gsi1Pk = $"LIKES#{username}",
            Gsi1Sk = $"DATE#{now}",
            TrackOwnerUsername = trackOwnerUsername,
            LikedAt = now,
        });

        var counterTx = CreateLikeCountUpdate(normalisedTrackId, trackOwnerUsername, 1);

        await _dynamoDbService.ExecuteTransactWriteAsync(likeTx, counterTx);
    }

    public async Task UnlikeTrackAsync(string trackId, string username, string trackOwnerUsername)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var existing = await GetLikeAsync(normalisedTrackId, username);
        if (existing is null)
            return;

        var likeTx = _dynamoDbService.CreateTransactionPart<LikeDataModel>();
        likeTx.AddDeleteItem(existing);

        var counterTx = CreateLikeCountUpdate(normalisedTrackId, trackOwnerUsername, -1);

        await _dynamoDbService.ExecuteTransactWriteAsync(likeTx, counterTx);
    }

    public async Task<bool> IsTrackLikedByUserAsync(string trackId, string username)
    {
        return await GetLikeAsync(trackId.ToLowerInvariant(), username) is not null;
    }

    public async Task<PaginatedResult<Track>> GetLikedTracksAsync(string username, int pageSize, string? cursor)
    {
        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<LikeDataModel>(
            hashKey: $"LIKES#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI1",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<Track> { Items = [], NextCursor = null };

        var trackRefs = likes
            .Select(l => (l.TrackId, l.TrackOwnerUsername))
            .ToList();

        var tracksById = await TrackBatchLookup.GetTracksAsync(_dynamoDbService, trackRefs);

        var tracks = likes
            .Select(l => tracksById.GetValueOrDefault(l.TrackId))
            .OfType<Track>()
            .ToList();

        return new PaginatedResult<Track> { Items = tracks, NextCursor = nextToken };
    }

    public async Task<PaginatedResult<TrackLiker>> GetTrackLikersAsync(string trackId, int pageSize, string? cursor)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var (likes, nextToken) = await _dynamoDbService.QueryPaginatedAsync<LikeDataModel>(
            hashKey: $"TRACK#{normalisedTrackId}",
            rangeKey: "LIKE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: null,
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (likes.Count == 0)
            return new PaginatedResult<TrackLiker> { Items = [], NextCursor = null };

        var profileKeys = likes.Select(l => (pk: $"USER#{l.LikerUsername}", sk: "PROFILE"));
        var profiles = (await _dynamoDbService.BatchGetAsync<UserDataModel>(profileKeys))
            .ToDictionary(u => u.Username);

        var likers = likes
            .Where(l => profiles.ContainsKey(l.LikerUsername))
            .Select(l => new TrackLiker { User = profiles[l.LikerUsername], LikedAt = l.LikedAt })
            .ToList();

        return new PaginatedResult<TrackLiker> { Items = likers, NextCursor = nextToken };
    }

    private Task<LikeDataModel?> GetLikeAsync(string normalisedTrackId, string username)
    {
        return _dynamoDbService.GetFromDynamoAsync<LikeDataModel>(
            $"TRACK#{normalisedTrackId}", $"LIKE#{username}");
    }

    private ITransactWrite CreateLikeCountUpdate(string normalisedTrackId, string trackOwnerUsername, int delta)
    {
        var tx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
        
        tx.AddSaveItem(
            $"USER#{trackOwnerUsername}",
            $"TRACK#{normalisedTrackId}",
            new Expression
            {
                ExpressionStatement = "ADD #lc :val",
                ExpressionAttributeNames = new Dictionary<string, string> { { "#lc", "likeCount" } },
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":val", delta } }
            }
        );

        return tx;
    }
}
