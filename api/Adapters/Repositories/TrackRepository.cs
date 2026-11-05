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
    private readonly ILikeRepository _likeRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IUploadStatusRepository _uploadStatusRepository;
    private readonly IShareLinkRepository _shareLinkRepository;

    public TrackRepository(IDynamoDBService dynamoDbService, IUserRepository userRepository,
        ILikeRepository likeRepository, ISharedTrackRepository sharedTrackRepository,
        IUploadStatusRepository uploadStatusRepository, IShareLinkRepository shareLinkRepository)
    {
        _dynamoDbService = dynamoDbService;
        _userRepository = userRepository;
        _likeRepository = likeRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _uploadStatusRepository = uploadStatusRepository;
        _shareLinkRepository = shareLinkRepository;
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
            TrackName = trackDto.TrackName,
            Owner = UserSummary.From(owner),
            Id = trackDto.TrackId,
            Slug = trackDto.Slug,
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

    public async Task CreateTrackAsync(string trackId, ProcessTrackInput input, AudioProcessingResult audio,
        ImageProcessingResult? image)
    {
        // Slug claim first (idempotent per track, so a retried execution reuses it), Track item after
        var slug = await SlugRecords.ClaimAsync(_dynamoDbService, input.Username, SlugKind.Track, trackId,
            input.Name!);

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
            ShareCount = input.SharedWith.Count,
            Slug = slug,
        });

        if (input.SharedWith.Count == 0)
        {
            await _dynamoDbService.ExecuteTransactWriteAsync(trackTx);
            return;
        }

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

        await WriteTrackAndFeedAsync(trackTx, sharedTx, trackId, input, now);
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
        string? description, ImageProcessingResult? image, bool clearImage, string? slug = null)
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

        // A new URL: claim its slug record in the same transaction (the old record stays as a redirect)
        if (slug is not null)
            builder.AddValue("slug", "s", slug);

        var tx = _dynamoDbService.CreateTransactionPart<TrackDataModel>();
        tx.AddSaveItem($"USER#{ownerUsername}", $"TRACK#{normalisedId}", builder.Build());
        if (slug is null)
            await _dynamoDbService.ExecuteTransactWriteAsync(tx);
        else if (!await _dynamoDbService.TryExecuteTransactWriteAsync(tx,
                     SlugRecords.BuildClaim(_dynamoDbService, ownerUsername, SlugKind.Track, normalisedId, slug)))
            throw new ArgumentException(SlugRecords.TakenMessage);

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
            Slug = item.Slug,
        };
    }

    // The Track item's footprint, each part removed by the repository that owns it (DeleteTrackLambda
    // has already revoked album memberships/grants and deleted the S3 objects). Retryable order:
    // relationships first, the Track item last, so a failed delete can simply run again.
    public async Task DeleteTrackAsync(string ownerUsername, string trackId)
    {
        var normalisedId = trackId.ToLowerInvariant();

        await _likeRepository.DeleteLikesForTrackAsync(normalisedId);
        await _sharedTrackRepository.DeleteSharesForTrackAsync(normalisedId);
        await _uploadStatusRepository.DeleteAsync(ownerUsername, normalisedId);
        await _shareLinkRepository.DeleteLinksForTargetAsync(ShareLinkKind.Track, normalisedId);
        await SlugRecords.DeleteForTargetAsync(_dynamoDbService, ownerUsername, SlugKind.Track, normalisedId);

        var trackBatch = _dynamoDbService.CreateBatchWritePart<TrackDataModel>();
        var (pk, sk) = Keys.Track(ownerUsername, normalisedId);
        trackBatch.AddDeleteKey(pk, sk);
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