using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class FeedRepository : IFeedRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public FeedRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<PaginatedResult<FeedEntry>> GetFeedAsync(string username, string? type,
        bool ascending, int pageSize, string? cursor)
    {
        // All types: GSI1 (DATE#{ts}, date-interleaved). One type: GSI2
        // ({TYPE}#DATE#{ts}) so the type is a key condition, not a filter.
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<FeedItemDataModel>(
            hashKey: $"FEED#{username}",
            rangeKey: type is null ? "DATE#" : $"{type}#DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: type is null ? "GSI1" : "GSI2",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: ascending
        );

        if (items.Count == 0)
            return new PaginatedResult<FeedEntry> { Items = [], NextCursor = nextToken };

        // Sender profile == track/album owner in every current share path
        var senderKeys = items.Select(i => i.SenderUsername).Distinct()
            .Select(u => (pk: $"USER#{u}", sk: "PROFILE"));
        var trackRefs = items.Where(i => i.Type == FeedItemType.Track)
            .Select(i => (i.TargetId, i.SenderUsername)).ToList();
        var albumKeys = items.Where(i => i.Type == FeedItemType.Album)
            .Select(i => (pk: $"USER#{i.SenderUsername}", sk: $"ALBUM#{i.TargetId}"));
        var albumIds = items.Where(i => i.Type == FeedItemType.Album).Select(i => i.TargetId).ToList();

        var sendersTask = _dynamoDbService.BatchGetAsync<UserDataModel>(senderKeys);
        var tracksTask = TrackBatchLookup.GetTrackSummariesAsync(_dynamoDbService, trackRefs, username);
        var albumsTask = _dynamoDbService.BatchGetAsync<AlbumDataModel>(albumKeys);
        var likedAlbumsTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(_dynamoDbService, username, albumIds);
        await Task.WhenAll(sendersTask, tracksTask, albumsTask, likedAlbumsTask);

        var senderProfiles = sendersTask.Result.ToDictionary(u => u.Username, StringComparer.OrdinalIgnoreCase);
        var tracks = tracksTask.Result;
        var albums = albumsTask.Result.ToDictionary(a => a.AlbumId, StringComparer.OrdinalIgnoreCase);

        var entries = items
            .Select(item => BuildEntry(item, senderProfiles, tracks, albums, likedAlbumsTask.Result))
            .OfType<FeedEntry>()
            .ToList();

        return new PaginatedResult<FeedEntry> { Items = entries, NextCursor = nextToken };
    }

    private static FeedEntry? BuildEntry(FeedItemDataModel item,
        IReadOnlyDictionary<string, UserDataModel> senders,
        IReadOnlyDictionary<string, TrackSummary> tracks,
        IReadOnlyDictionary<string, AlbumDataModel> albums,
        IReadOnlySet<string> likedAlbumIds)
    {
        if (!senders.TryGetValue(item.SenderUsername, out var sender))
            return null;

        var entry = new FeedEntry
        {
            Type = item.Type,
            Sender = UserSummary.From(sender),
            SharedAt = item.SharedAt,
            Caption = item.Caption,
        };

        if (item.Type == FeedItemType.Track)
        {
            if (!tracks.TryGetValue(item.TargetId, out var track))
                return null; // target deleted
            entry.Track = track;
        }
        else
        {
            if (!albums.TryGetValue(item.TargetId, out var album))
                return null; // target deleted
            entry.Album = AlbumSummary.From(album, sender, likedAlbumIds.Contains(item.TargetId));
        }

        return entry;
    }
}