using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class SlugRepository : ISlugRepository
{
    private readonly IDynamoDBService _dynamoDbService;

    public SlugRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<string?> GetTargetIdAsync(string ownerUsername, string kind, string slug)
    {
        var record = await SlugRecords.GetAsync(_dynamoDbService, ownerUsername, kind, slug.ToLowerInvariant());
        return record?.TargetId;
    }
}
