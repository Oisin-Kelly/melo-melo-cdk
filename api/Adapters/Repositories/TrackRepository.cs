using Amazon.DynamoDBv2.DataModel;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class TrackRepository : ITrackRepository
{
    private readonly IDynamoDBService _dynamoDbService;
    private readonly IUserRepository _userRepository;

    public TrackRepository(IDynamoDBService dynamoDbService, IUserRepository userRepository)
    {
        _dynamoDbService = dynamoDbService;
        _userRepository = userRepository;
    }

    public async Task<Track?> GetTrackAsync(string trackId)
    {
        var trackDto = await GetTrackDtoAsync(trackId);
        if (trackDto == null)
            return null;
        
        var owner = await GetTrackOwner(trackDto);
        if (owner == null)
            return null;
        
        return new Track()
        {
            CreatedAt = trackDto.CreatedAt,
            Description = trackDto.Description,
            Duration = trackDto.Duration,
            Genre = trackDto.Genre,
            ImageUrl = trackDto.ImageUrl,
            ImageBgColor = trackDto.ImageBgColor,
            Segments = trackDto.Segments,
            TrackName = trackDto.TrackName,
            Owner = UserSummary.From(owner),
            Id = trackDto.TrackId,
            LikeCount = trackDto.LikeCount,
            ShareCount = trackDto.ShareCount,
        };
    }

    private async Task<TrackDataModel?> GetTrackDtoAsync(string trackId)
    {
        var normalisedTrackId = trackId.ToLowerInvariant();

        var tracks = await _dynamoDbService.QueryAsync<TrackDataModel>(
            $"TRACK#{normalisedTrackId}",
            "INFO",
            QueryOperator.Equal,
            "GSI1"
        );

        return tracks.FirstOrDefault();
    }

    public async Task<PaginatedResult<TrackSummary>> GetTracksByUsername(string username, int pageSize, string? cursor)
    {
        var (trackDtos, nextToken) = await _dynamoDbService.QueryPaginatedAsync<TrackDataModel>(
            hashKey: $"USER#{username}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (trackDtos.Count == 0)
            return new PaginatedResult<TrackSummary> { Items = [], NextCursor = null };

        var ownerTask = _userRepository.GetUserByUsername(username);
        var likedTask = TrackBatchLookup.GetLikedTrackIdsAsync(
            _dynamoDbService, username, trackDtos.Select(t => t.TrackId).ToList());
        await Task.WhenAll(ownerTask, likedTask);

        var owner = ownerTask.Result;
        if (owner is null)
            return new PaginatedResult<TrackSummary> { Items = [], NextCursor = null };

        var tracks = trackDtos
            .Select(t => TrackSummary.From(t, owner, likedTask.Result.Contains(t.TrackId)))
            .ToList();

        return new PaginatedResult<TrackSummary> { Items = tracks, NextCursor = nextToken };
    }

    public Task CreateTrackAsync(string trackId, ProcessTrackInput input, AudioProcessingResult audio,
        ImageProcessingResult? image)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var trackTx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
        trackTx.AddSaveItem(new TrackDataModel
        {
            Pk = $"USER#{input.Username}",
            Sk = $"TRACK#{trackId}",
            Gsi1Pk = $"TRACK#{trackId}",
            Gsi1Sk = "INFO",
            Gsi3Pk = $"USER#{input.Username}",
            Gsi3Sk = $"DATE#{now}",
            TrackName = input.Name!,
            Description = input.Description,
            Genre = input.Genre,
            ImageUrl = image?.ImageUrl,
            ImageBgColor = image?.ImageHex,
            CreatedAt = now,
            Duration = audio.DurationSeconds,
            Segments = audio.Segments,
            ShareCount = input.SharedWith.Count,
        });

        if (input.SharedWith.Count == 0)
            return _dynamoDbService.ExecuteTransactWriteAsync(trackTx);

        var sharedTx = _dynamoDbService.CreateTransactionPart<SharedTrackDataModel>();
        foreach (var recipient in input.SharedWith)
        {
            sharedTx.AddSaveItem(new SharedTrackDataModel
            {
                Pk = $"TRACK#{trackId}",
                Sk = $"SHARED#{recipient}",
                Gsi1Pk = $"SHARED#{recipient}",
                Gsi1Sk = $"DATE#{now}",
                Gsi2Sk = $"SENDER#{input.Username}#DATE#{now}",
                TrackOwnerUsername = input.Username,
                SharedAt = now,
                Caption = input.Caption,
            });
        }

        return WriteTrackAndFeedAsync(trackTx, sharedTx, trackId, input, now);
    }

    private async Task WriteTrackAndFeedAsync(ITransactWrite trackTx, ITransactWrite sharedTx,
        string trackId, ProcessTrackInput input, long now)
    {
        await _dynamoDbService.ExecuteTransactWriteAsync(trackTx, sharedTx);

        var feedBatch = _dynamoDbService.CreateBatchWritePart<FeedItemDataModel>();
        var activityBatch = _dynamoDbService.CreateBatchWritePart<ActivityItemDataModel>();
        foreach (var recipient in input.SharedWith)
        {
            feedBatch.AddPutItem(FeedItems.Build(recipient, FeedItemType.Track, trackId, input.Username, now,
                input.Caption));
            activityBatch.AddPutItem(ActivityItems.Build(recipient, ActivityType.TrackShared, input.Username,
                FeedItemType.Track, trackId, now));
        }

        await _dynamoDbService.ExecuteBatchWriteAsync(feedBatch, activityBatch);
    }

    public async Task<Track?> UpdateTrackAsync(string ownerUsername, string trackId, string name, string? genre,
        string? description, ImageProcessingResult? image, bool clearImage)
    {
        var normalisedId = trackId.ToLowerInvariant();

        var builder = new UpdateExpressionBuilder();
        builder.AddValue("trackName", "n", name);
        builder.AddNullableString("genre", "g", genre);
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

        var tx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
        tx.AddSaveItem($"USER#{ownerUsername}", $"TRACK#{normalisedId}", builder.Build());
        await _dynamoDbService.ExecuteTransactWriteAsync(tx);

        var item = await _dynamoDbService.GetFromDynamoAsync<TrackDataModel>(
            $"USER#{ownerUsername}", $"TRACK#{normalisedId}");
        if (item is null)
            return null;

        var owner = await _userRepository.GetUserByUsername(ownerUsername);
        if (owner is null)
            return null;

        return new Track
        {
            Id = item.TrackId,
            TrackName = item.TrackName,
            Genre = item.Genre,
            Description = item.Description,
            ImageUrl = item.ImageUrl,
            ImageBgColor = item.ImageBgColor,
            Owner = UserSummary.From(owner),
            CreatedAt = item.CreatedAt,
            Duration = item.Duration,
            Segments = item.Segments,
        };
    }

    public async Task DeleteTrackAsync(string ownerUsername, string trackId)
    {
        var normalisedId = trackId.ToLowerInvariant();

        var accessRecords = await _dynamoDbService.QueryAsync<AlbumTrackGrantDataModel>(
            $"TRACK#{normalisedId}",
            "SHARED#",
            QueryOperator.BeginsWith);

        var likes = await _dynamoDbService.QueryAsync<LikeDataModel>(
            $"TRACK#{normalisedId}",
            "LIKE#",
            QueryOperator.BeginsWith);

        // Direct-share recipients (SK SHARED#{user}, not SHARED#{user}#ALBUM#…) each
        // have a feed item to remove; album grants never created feed items
        var feedKeys = accessRecords
            .Where(r => !r.Sk.Contains("#ALBUM#"))
            .Select(r => FeedItems.Key(r.Sk.Replace("SHARED#", ""), FeedItemType.Track, normalisedId));

        var keys = accessRecords.Select(r => (r.Pk, r.Sk))
            .Concat(likes.Select(l => (l.Pk, l.Sk)))
            .Concat(feedKeys)
            .Append(($"USER#{ownerUsername}", $"UPLOAD#{normalisedId}"))
            .ToList();

        if (keys.Count > 0)
        {
            var batch = _dynamoDbService.CreateBatchWritePart<TrackDataModel>();
            
            foreach (var (pk, sk) in keys)
                batch.AddDeleteKey(pk, sk);
            
            await _dynamoDbService.ExecuteBatchWriteAsync(batch);
        }

        var trackBatch = _dynamoDbService.CreateBatchWritePart<TrackDataModel>();
        trackBatch.AddDeleteKey($"USER#{ownerUsername}", $"TRACK#{normalisedId}");
        
        await _dynamoDbService.ExecuteBatchWriteAsync(trackBatch);
    }

    public async Task<List<string>> GetOwnedTrackIdsAsync(string ownerUsername, IReadOnlyList<string> trackIds)
    {
        if (trackIds.Count == 0)
            return [];

        var keys = trackIds
            .Select(id => id.ToLowerInvariant())
            .Distinct()
            .Select(id => (pk: $"USER#{ownerUsername}", sk: $"TRACK#{id}"));

        var found = await _dynamoDbService.BatchGetAsync<TrackDataModel>(keys);
        
        return found.Select(t => t.TrackId).ToList();
    }

    private Task<User?> GetTrackOwner(TrackDataModel trackDto)
    {
        return _userRepository.GetUserByUsername(trackDto.OwnerUsername);
    }
}