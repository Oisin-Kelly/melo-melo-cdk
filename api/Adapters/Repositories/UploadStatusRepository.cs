using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class UploadStatusRepository : IUploadStatusRepository
{
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    // A PROCESSING record older than this belongs to a processor that died before it could
    // say so (ProcessTrackLambda times out at 15 minutes; the margin covers the state machine
    // starting it), so it's reported as FAILED
    public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(20);
    public const string StaleReason = "Processing took too long. Please try again.";

    private readonly IDynamoDBService _dynamoDbService;

    public UploadStatusRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public Task CreateProcessingAsync(string username, string trackId, string name)
    {
        var now = DateTimeOffset.UtcNow;

        return _dynamoDbService.WriteToDynamoAsync(new UploadStatusDataModel
        {
            Pk = $"USER#{username}",
            Sk = $"UPLOAD#{trackId.ToLowerInvariant()}",
            Status = UploadState.Processing,
            TrackName = name,
            CreatedAt = now.ToUnixTimeMilliseconds(),
            ExpiresAt = now.Add(Ttl).ToUnixTimeSeconds(),
        });
    }

    public Task MarkCompleteAsync(string username, string trackId)
    {
        return UpdateStatusAsync(username, trackId, UploadState.Complete, null);
    }

    public Task MarkFailedAsync(string username, string trackId, string reason)
    {
        return UpdateStatusAsync(username, trackId, UploadState.Failed, reason);
    }

    public async Task DeleteAsync(string username, string trackId)
    {
        var batch = _dynamoDbService.CreateBatchWritePart<UploadStatusDataModel>();
        batch.AddDeleteKey($"USER#{username}", $"UPLOAD#{trackId.ToLowerInvariant()}");
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    public async Task<UploadStatus?> GetAsync(string username, string trackId)
    {
        var item = await _dynamoDbService.GetFromDynamoAsync<UploadStatusDataModel>(
            $"USER#{username}", $"UPLOAD#{trackId.ToLowerInvariant()}");

        return item is null ? null : ToStatus(item, DateTimeOffset.UtcNow);
    }

    public async Task<List<UploadStatus>> GetUnfinishedAsync(string username)
    {
        // At most a day's uploads (the TTL), so one unpaged query
        var items = await _dynamoDbService.QueryAsync<UploadStatusDataModel>(
            $"USER#{username}", "UPLOAD#", QueryOperator.BeginsWith);

        var now = DateTimeOffset.UtcNow;
        return items
            .Select(item => ToStatus(item, now))
            .Where(status => status.Status != UploadState.Complete)
            .OrderByDescending(status => status.CreatedAt)
            .ToList();
    }

    public async Task<bool> DismissAsync(string username, string trackId)
    {
        var status = await GetAsync(username, trackId);
        if (status?.Status == UploadState.Processing)
            return false;
        if (status is not null)
            await DeleteAsync(username, trackId);
        return true;
    }

    private static UploadStatus ToStatus(UploadStatusDataModel item, DateTimeOffset now)
    {
        var isStale = item.Status == UploadState.Processing
                      && now.ToUnixTimeMilliseconds() - item.CreatedAt > StaleAfter.TotalMilliseconds;

        return new UploadStatus
        {
            TrackId = item.TrackId,
            Status = isStale ? UploadState.Failed : item.Status,
            Name = item.TrackName,
            Error = isStale ? StaleReason : item.Error,
            CreatedAt = item.CreatedAt,
        };
    }

    // Only while the record exists: a dismissed upload whose processor finishes late must not
    // come back as a nameless record
    private Task UpdateStatusAsync(string username, string trackId, string status, string? error)
    {
        var builder = new UpdateExpressionBuilder();
        builder.AddValue("status", "s", status);
        builder.AddNullableString("error", "e", error);
        builder.AddValue("expiresAt", "x", DateTimeOffset.UtcNow.Add(Ttl).ToUnixTimeSeconds());

        var tx = _dynamoDbService.CreateTransactionPart<UploadStatusDataModel>();
        tx.AddSaveItem($"USER#{username}", $"UPLOAD#{trackId.ToLowerInvariant()}", builder.Build(),
            ConditionExpressions.ItemExists());
        return _dynamoDbService.TryExecuteTransactWriteAsync(tx);
    }
}
