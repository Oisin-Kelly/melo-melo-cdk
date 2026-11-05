using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class AlbumRepository : IAlbumRepository
{
    private readonly IDynamoDBService _dynamoDbService;
    private readonly IAlbumTracklistRepository _tracklistRepository;
    private readonly IAlbumShareRepository _shareRepository;
    private readonly IAlbumLikeRepository _albumLikeRepository;
    private readonly IShareLinkRepository _shareLinkRepository;

    public AlbumRepository(IDynamoDBService dynamoDbService, IAlbumTracklistRepository tracklistRepository,
        IAlbumShareRepository shareRepository, IAlbumLikeRepository albumLikeRepository,
        IShareLinkRepository shareLinkRepository)
    {
        _dynamoDbService = dynamoDbService;
        _tracklistRepository = tracklistRepository;
        _shareRepository = shareRepository;
        _albumLikeRepository = albumLikeRepository;
        _shareLinkRepository = shareLinkRepository;
    }

    public async Task<PaginatedResult<AlbumSummary>> GetAlbumsAsync(string ownerUsername, int pageSize, string? cursor)
    {
        var (items, nextToken) = await _dynamoDbService.QueryPaginatedAsync<AlbumDataModel>(
            hashKey: $"ALBUMS#{ownerUsername}",
            rangeKey: "DATE#",
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: false
        );

        if (items.Count == 0)
            return new PaginatedResult<AlbumSummary> { Items = [], NextCursor = null };

        var (profilePk, profileSk) = Keys.Profile(ownerUsername);
        var ownerTask = _dynamoDbService.GetFromDynamoAsync<UserDataModel>(profilePk, profileSk);

        // likedAlbumIdsTask is for checking if the user's own album is liked by themselves
        var likedAlbumIdsTask = AlbumLikeRepository.GetLikedAlbumIdsAsync(
            _dynamoDbService, ownerUsername, items.Select(i => i.AlbumId).ToList());

        await Task.WhenAll(ownerTask, likedAlbumIdsTask);

        var owner = ownerTask.Result;
        if (owner is null)
            return new PaginatedResult<AlbumSummary> { Items = [], NextCursor = null };

        return new PaginatedResult<AlbumSummary>
        {
            Items = items.Select(item => AlbumSummary.From(item, owner, likedAlbumIdsTask.Result.Contains(item.AlbumId)))
                .ToList(),
            NextCursor = nextToken,
        };
    }

    public async Task<Album?> GetAlbumByIdAsync(string albumId)
    {
        var normalisedId = albumId.ToLowerInvariant();

        var items = await _dynamoDbService.QueryAsync<AlbumDataModel>(
            hashKey: $"ALBUM#{normalisedId}",
            rangeKey: "INFO",
            queryOperator: QueryOperator.Equal,
            indexName: "GSI1");

        var item = items.FirstOrDefault();
        return item is null ? null : ToAlbum(item);
    }

    public async Task<Album> CreateAlbumAsync(string albumId, string ownerUsername, string name, string? description,
        ImageProcessingResult? image, IReadOnlyList<string> trackIds)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var durations = await AlbumRecords.GetTrackDurationsAsync(_dynamoDbService, ownerUsername, trackIds);
        var slug = await SlugRecords.ClaimAsync(_dynamoDbService, ownerUsername, SlugKind.Album, albumId, name);

        // Memberships first, meta last — the album only becomes visible once fully written
        if (trackIds.Count > 0)
        {
            var membershipBatch = _dynamoDbService.CreateBatchWritePart<AlbumTrackDataModel>();
            var rank = 0;
            foreach (var trackId in trackIds)
            {
                rank += MembershipRank.Gap;
                membershipBatch.AddPutItem(AlbumRecords.BuildMembership(albumId, trackId, ownerUsername, now, rank,
                    durations.GetValueOrDefault(trackId.ToLowerInvariant())));
            }

            await _dynamoDbService.ExecuteBatchWriteAsync(membershipBatch);
        }

        var (pk, sk) = Keys.Album(ownerUsername, albumId);
        var meta = new AlbumDataModel
        {
            Pk = pk,
            Sk = sk,
            Gsi1Pk = $"ALBUM#{albumId}",
            Gsi1Sk = "INFO",
            Gsi3Pk = $"ALBUMS#{ownerUsername}",
            Gsi3Sk = $"DATE#{now}",
            Name = name,
            Description = description,
            ImageUrl = image?.ImageUrl,
            ImageBgColor = image?.ImageHex,
            TrackCount = trackIds.Count,
            TotalDurationSeconds = durations.Values.Sum(),
            CreatedAt = now,
            Slug = slug,
        };
        await _dynamoDbService.WriteToDynamoAsync(meta);

        return ToAlbum(meta);
    }

    public async Task<Album?> UpdateAlbumAsync(string ownerUsername, string albumId, string? name,
        string? description, ImageProcessingResult? image, bool clearImage, string? slug = null)
    {
        var normalisedId = albumId.ToLowerInvariant();
        var (pk, sk) = Keys.Album(ownerUsername, normalisedId);

        var builder = new UpdateExpressionBuilder();
        builder.AddNullableString("name", "n", name);
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

        if (!builder.IsEmpty)
        {
            var tx = _dynamoDbService.CreateTransactionPart<AlbumDataModel>();
            tx.AddSaveItem(pk, sk, builder.Build());
            if (slug is null)
                await _dynamoDbService.ExecuteTransactWriteAsync(tx);
            else if (!await _dynamoDbService.TryExecuteTransactWriteAsync(tx,
                         SlugRecords.BuildClaim(_dynamoDbService, ownerUsername, SlugKind.Album, normalisedId, slug)))
                throw new ArgumentException(SlugRecords.TakenMessage);
        }

        var item = await _dynamoDbService.GetFromDynamoAsync<AlbumDataModel>(pk, sk);
        return item is null ? null : ToAlbum(item);
    }

    // Retryable order, each part removed by the repository that owns it: revoke derived access
    // first (so a mid-delete crash never leaves hidden grants behind), then likes, then the
    // memberships, and the meta item last — until then the album still lists and can be re-deleted.
    public async Task DeleteAlbumAsync(string ownerUsername, string albumId)
    {
        var normalisedId = albumId.ToLowerInvariant();

        await _shareRepository.DeleteAllSharesAsync(normalisedId);
        await _albumLikeRepository.DeleteLikesForAlbumAsync(normalisedId);
        await _tracklistRepository.DeleteAllTracksAsync(normalisedId);
        await _shareLinkRepository.DeleteLinksForTargetAsync(ShareLinkKind.Album, normalisedId);
        await SlugRecords.DeleteForTargetAsync(_dynamoDbService, ownerUsername, SlugKind.Album, normalisedId);

        var metaBatch = _dynamoDbService.CreateBatchWritePart<AlbumDataModel>();
        var (pk, sk) = Keys.Album(ownerUsername, normalisedId);
        metaBatch.AddDeleteKey(pk, sk);
        await _dynamoDbService.ExecuteBatchWriteAsync(metaBatch);
    }

    private static Album ToAlbum(AlbumDataModel item) => new()
    {
        Id = item.AlbumId,
        Name = item.Name,
        Description = item.Description,
        ImageUrl = item.ImageUrl,
        ImageBgColor = item.ImageBgColor,
        TrackCount = item.TrackCount,
        TotalDurationSeconds = item.TotalDurationSeconds,
        ShareCount = item.ShareCount, // handlers null share/like counts for non-owners
        LikeCount = item.LikeCount,
        CreatedAt = item.CreatedAt,
        Slug = item.Slug,
        OwnerUsername = item.OwnerUsername,
    };
}
