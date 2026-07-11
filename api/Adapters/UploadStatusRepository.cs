using Domain;
using Ports;

namespace Adapters;

public sealed class UploadStatusRepository : IUploadStatusRepository
{
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    private readonly IDynamoDBService _dynamoDbService;

    public UploadStatusRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public Task CreateProcessingAsync(string username, string trackId)
    {
        var now = DateTimeOffset.UtcNow;

        return _dynamoDbService.WriteToDynamoAsync(new UploadStatusDataModel
        {
            Pk = $"USER#{username}",
            Sk = $"UPLOAD#{trackId.ToLowerInvariant()}",
            Status = UploadState.Processing,
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

    public async Task<UploadStatus?> GetAsync(string username, string trackId)
    {
        var item = await _dynamoDbService.GetFromDynamoAsync<UploadStatusDataModel>(
            $"USER#{username}", $"UPLOAD#{trackId.ToLowerInvariant()}");

        if (item is null)
            return null;

        return new UploadStatus
        {
            TrackId = item.TrackId,
            Status = item.Status,
            Error = item.Error,
            CreatedAt = item.CreatedAt,
        };
    }

    private Task UpdateStatusAsync(string username, string trackId, string status, string? error)
    {
        var builder = new UpdateExpressionBuilder();
        builder.AddValue("status", "s", status);
        builder.AddNullableString("error", "e", error);
        builder.AddValue("expiresAt", "x", DateTimeOffset.UtcNow.Add(Ttl).ToUnixTimeSeconds());

        var tx = _dynamoDbService.CreateTransactionPart<UploadStatusDataModel>();
        tx.AddSaveItem($"USER#{username}", $"UPLOAD#{trackId.ToLowerInvariant()}", builder.Build());
        return _dynamoDbService.ExecuteTransactWriteAsync(tx);
    }
}
