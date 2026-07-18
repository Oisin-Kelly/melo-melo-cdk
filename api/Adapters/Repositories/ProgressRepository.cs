using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class ProgressRepository : IProgressRepository
{
    private const string LatestSk = "PROGRESS#LATEST";
    private static readonly TimeSpan Ttl = TimeSpan.FromDays(30);

    private readonly IDynamoDBService _dynamoDbService;
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;

    public ProgressRepository(IDynamoDBService dynamoDbService, ITrackRepository trackRepository,
        ISharedTrackRepository sharedTrackRepository)
    {
        _dynamoDbService = dynamoDbService;
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
    }

    public Task UpsertAsync(string username, string contextType, string contextId, string trackId,
        int positionSeconds)
    {
        var now = DateTimeOffset.UtcNow;

        return _dynamoDbService.WriteToDynamoAsync(new UserProgressDataModel
        {
            Pk = $"USER#{username}",
            Sk = LatestSk,
            ContextType = contextType,
            ContextId = contextId.ToLowerInvariant(),
            TrackId = trackId.ToLowerInvariant(),
            PositionSeconds = positionSeconds,
            UpdatedAt = now.ToUnixTimeMilliseconds(),
            ExpiresAt = now.Add(Ttl).ToUnixTimeSeconds(),
        });
    }

    public async Task ClearAsync(string username)
    {
        var batch = _dynamoDbService.CreateBatchWritePart<UserProgressDataModel>();
        batch.AddDeleteKey($"USER#{username}", LatestSk);
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    public async Task<ProgressEntry?> GetResolvableAsync(string username)
    {
        var record = await _dynamoDbService.GetFromDynamoAsync<UserProgressDataModel>(
            $"USER#{username}", LatestSk);
        if (record is null)
            return null;

        // A deleted/revoked track is skipped, not surfaced as dead resume state
        var track = await _trackRepository.GetTrackAsync(record.TrackId);
        if (track is null)
            return null;

        var hasAccess = track.Owner.Username == username ||
                        await _sharedTrackRepository.IsTrackAccessibleToUser(record.TrackId, username);
        if (!hasAccess)
            return null;

        var liked = await TrackBatchLookup.GetLikedTrackIdsAsync(_dynamoDbService, username, [record.TrackId]);

        return new ProgressEntry
        {
            ContextType = record.ContextType,
            ContextId = record.ContextId,
            TrackId = record.TrackId,
            PositionSeconds = record.PositionSeconds,
            UpdatedAt = record.UpdatedAt,
            Track = new TrackSummary
            {
                Id = track.Id,
                Name = track.TrackName,
                Duration = track.Duration,
                ImageUrl = track.ImageUrl,
                ImageBgColor = track.ImageBgColor,
                CreatedAt = track.CreatedAt,
                LikedByMe = liked.Contains(record.TrackId),
                Owner = track.Owner,
            },
        };
    }
}
