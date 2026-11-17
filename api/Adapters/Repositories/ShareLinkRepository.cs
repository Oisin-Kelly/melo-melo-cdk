using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class ShareLinkRepository : IShareLinkRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public ShareLinkRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<ShareLinkDataModel> CreateAsync(string ownerUsername, string kind, string targetId,
        TimeSpan expiresIn, string? caption = null)
    {
        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(expiresIn);
        var token = ShareLinks.NewToken();
        var (pk, sk) = ShareLinks.Key(token);

        var link = new ShareLinkDataModel
        {
            Pk = pk,
            Sk = sk,
            Gsi3Pk = ShareLinks.ListPk(kind, targetId.ToLowerInvariant()),
            Gsi3Sk = $"DATE#{now.ToUnixTimeMilliseconds()}",
            Token = token,
            Owner = ownerUsername,
            Kind = kind,
            TargetId = targetId.ToLowerInvariant(),
            CreatedAt = now.ToUnixTimeMilliseconds(),
            LinkExpiresAt = expires.ToUnixTimeMilliseconds(),
            ExpiresAt = expires.Add(ShareLinks.ExpiredGrace).ToUnixTimeSeconds(),
            Caption = caption,
        };

        // 128 random bits never collide in practice; the guard just makes sure a link is never
        // silently overwritten
        var part = _dynamoDbService.CreateTransactionPart<ShareLinkDataModel>();
        _dynamoDbService.AddConditionalSave(part, link, ConditionExpressions.ItemNotExists());
        if (!await _dynamoDbService.TryExecuteTransactWriteAsync(part))
            throw new InvalidOperationException("Share link token collision");

        return link;
    }

    public Task<ShareLinkDataModel?> GetAsync(string token)
    {
        if (!ShareLinks.IsWellFormed(token))
            return Task.FromResult<ShareLinkDataModel?>(null);

        var (pk, sk) = ShareLinks.Key(token);
        return _dynamoDbService.GetFromDynamoAsync<ShareLinkDataModel>(pk, sk);
    }

    public async Task<List<ShareLinkDataModel>> ListForTargetAsync(string kind, string targetId)
    {
        var links = await _dynamoDbService.QueryAsync<ShareLinkDataModel>(
            ShareLinks.ListPk(kind, targetId.ToLowerInvariant()), "DATE#", QueryOperator.BeginsWith, "GSI3");
        return links.OrderByDescending(l => l.CreatedAt).ToList();
    }

    public Task RevokeAsync(string token) =>
        // if_not_exists keeps the first revoke time when it's revoked twice
        UpdateExistingAsync(token, new Expression
        {
            ExpressionStatement = "SET #rev = if_not_exists(#rev, :now)",
            ExpressionAttributeNames = new Dictionary<string, string> { { "#rev", "revokedAt" } },
            ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry>
            {
                { ":now", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
            },
        });

    public Task RestoreAsync(string token) =>
        UpdateExistingAsync(token, new Expression
        {
            ExpressionStatement = "REMOVE #rev",
            ExpressionAttributeNames = new Dictionary<string, string> { { "#rev", "revokedAt" } },
        });

    public async Task<bool> TryClaimAsync(string token)
    {
        if (!ShareLinks.IsWellFormed(token))
            return false;

        var (pk, sk) = ShareLinks.Key(token);
        var part = _dynamoDbService.CreateTransactionPart<ShareLinkDataModel>();
        part.AddSaveItem(pk, sk, CounterExpressions.Add(("acceptedCount", 1)), new Expression
        {
            ExpressionStatement =
                "attribute_exists(#condPk) AND attribute_not_exists(#condRev) AND #condExp > :condNow",
            ExpressionAttributeNames = new Dictionary<string, string>
            {
                { "#condPk", "PK" },
                { "#condRev", "revokedAt" },
                { "#condExp", "linkExpiresAt" },
            },
            ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry>
            {
                { ":condNow", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() },
            },
        });
        return await _dynamoDbService.TryExecuteTransactWriteAsync(part);
    }

    public async Task DeleteLinksForTargetAsync(string kind, string targetId)
    {
        var links = await ListForTargetAsync(kind, targetId);
        if (links.Count == 0)
            return;

        var batch = _dynamoDbService.CreateBatchWritePart<ShareLinkDataModel>();
        foreach (var link in links)
            batch.AddDeleteKey(link.Pk, link.Sk);
        await _dynamoDbService.ExecuteBatchWriteAsync(batch);
    }

    // An update that never creates an item: an unknown token is a no-op
    private async Task UpdateExistingAsync(string token, Expression update)
    {
        if (!ShareLinks.IsWellFormed(token))
            return;

        var (pk, sk) = ShareLinks.Key(token);
        var part = _dynamoDbService.CreateTransactionPart<ShareLinkDataModel>();
        part.AddSaveItem(pk, sk, update, ConditionExpressions.ItemExists());
        await _dynamoDbService.TryExecuteTransactWriteAsync(part);
    }
}
