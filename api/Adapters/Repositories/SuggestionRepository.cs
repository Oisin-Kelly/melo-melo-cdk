using Adapters.Suggestions;
using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

// People you may know (docs/suggestions-design.md), worked out on each request from records
// the user already has — about 35 small reads, fine at this size. If it gets slow, the upgrade
// is to precompute SUGGESTION# rows from the table's stream; the response stays the same.
public sealed class SuggestionRepository : ISuggestionRepository
{
    private const int FollowCap = 200;
    private const int SharedWithMeCap = 100;
    private const int OwnTracksChecked = 20;
    private const int FollowingsExpanded = 30;
    private const int TheirFollowingCap = 100;
    private static readonly TimeSpan HideFor = TimeSpan.FromDays(180);

    private readonly IDynamoDBService _dynamoDbService;

    public SuggestionRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<List<SuggestedUser>> GetSuggestionsAsync(string username, int limit)
    {
        var followingTask = FollowingAsync(username, FollowCap);
        var followersTask = FollowersAsync(username);
        var sharedWithMeTask = SharedWithMeAsync(username);
        var iSharedWithTask = ISharedWithAsync(username);
        var hiddenTask = _dynamoDbService.QueryAsync<HiddenSuggestionDataModel>(
            $"USER#{username}", "HIDE_SUGGESTION#", QueryOperator.BeginsWith);
        await Task.WhenAll(followingTask, followersTask, sharedWithMeTask, iSharedWithTask, hiddenTask);
        var following = followingTask.Result;

        // Friends of friends: who the people I follow (most recent first) follow
        var theirFollowing = await Task.WhenAll(following.Take(FollowingsExpanded)
            .Select(async friend => (friend, follows: await FollowingAsync(friend, TheirFollowingCap))));
        var followedBy = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var (friend, follows) in theirFollowing)
            foreach (var candidate in follows)
            {
                if (!followedBy.TryGetValue(candidate, out var mutuals))
                    followedBy[candidate] = mutuals = [];
                mutuals.Add(friend);
            }

        var scored = SuggestionScoring.Score(new SuggestionSignals
        {
            Me = username,
            Following = following.ToHashSet(StringComparer.OrdinalIgnoreCase),
            Hidden = hiddenTask.Result.Select(h => h.Username).ToHashSet(StringComparer.OrdinalIgnoreCase),
            FollowsMe = followersTask.Result,
            SharedWithMe = sharedWithMeTask.Result,
            ISharedWith = iSharedWithTask.Result,
            FollowedByMyFollowing = followedBy,
        }, limit * 2);
        if (scored.Count == 0)
            return [];

        // Following lists are capped, so check the finalists directly: anyone I already
        // follow beyond the cap mustn't be suggested
        var alreadyFollowed = (await _dynamoDbService.BatchGetAsync<UserFollowDataModel>(
                scored.Select(s => (pk: $"FOLLOW#{s.Username}", sk: $"USER#{username}"))))
            .Select(f => f.Pk.Replace("FOLLOW#", ""))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var finalists = scored.Where(s => !alreadyFollowed.Contains(s.Username)).Take(limit).ToList();

        // One profile lookup for everyone shown: the suggestions and their first two mutuals
        var profiles = await ProfileLookup.GetAsync(_dynamoDbService,
            finalists.SelectMany(s => s.Mutuals.Take(2).Prepend(s.Username)));

        return finalists
            .Where(s => profiles.ContainsKey(s.Username))
            .Select(s => new SuggestedUser
            {
                User = UserSummary.From(profiles[s.Username]),
                Reason = s.Reason,
                Mutuals = s.Mutuals.Take(2).Where(profiles.ContainsKey)
                    .Select(m => UserSummary.From(profiles[m])).ToList(),
                MutualCount = s.Mutuals.Count,
            })
            .ToList();
    }

    public Task HideAsync(string username, string hiddenUsername)
    {
        var now = DateTimeOffset.UtcNow;
        return _dynamoDbService.WriteToDynamoAsync(new HiddenSuggestionDataModel
        {
            Pk = $"USER#{username}",
            Sk = $"HIDE_SUGGESTION#{hiddenUsername}",
            HiddenAt = now.ToUnixTimeMilliseconds(),
            ExpiresAt = now.Add(HideFor).ToUnixTimeSeconds(),
        });
    }

    /// Who `username` follows, newest first (GSI1 FOLLOWING#{u})
    private async Task<List<string>> FollowingAsync(string username, int cap)
    {
        var (items, _) = await _dynamoDbService.QueryPaginatedAsync<UserFollowDataModel>(
            $"FOLLOWING#{username}", "DATE#", QueryOperator.BeginsWith, "GSI1", cap, null);
        return items.Select(f => f.Pk.Replace("FOLLOW#", "")).ToList();
    }

    /// Who follows `username` (GSI3 FOLLOWERS#{u})
    private async Task<HashSet<string>> FollowersAsync(string username)
    {
        var (items, _) = await _dynamoDbService.QueryPaginatedAsync<UserFollowDataModel>(
            $"FOLLOWERS#{username}", "DATE#", QueryOperator.BeginsWith, "GSI3", FollowCap, null);
        return items.Select(f => f.Sk.Replace("USER#", "")).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// Owners of the tracks and albums most recently shared with `username`
    private async Task<HashSet<string>> SharedWithMeAsync(string username)
    {
        var tracksTask = _dynamoDbService.QueryPaginatedAsync<SharedTrackDataModel>(
            $"SHARED#{username}", "DATE#", QueryOperator.BeginsWith, "GSI1", SharedWithMeCap, null);
        var albumsTask = _dynamoDbService.QueryPaginatedAsync<AlbumShareDataModel>(
            $"ALBUMSHARED#{username}", "DATE#", QueryOperator.BeginsWith, "GSI1", SharedWithMeCap, null);
        await Task.WhenAll(tracksTask, albumsTask);
        return tracksTask.Result.Items.Select(s => s.TrackOwnerUsername)
            .Concat(albumsTask.Result.Items.Select(s => s.AlbumOwnerUsername))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// Who `username` has shared their newest tracks with directly. There's no index by
    /// sender, so it's each track's own SHARED# records (album grants, SHARED#{u}#ALBUM#…, skipped)
    private async Task<HashSet<string>> ISharedWithAsync(string username)
    {
        var (tracks, _) = await _dynamoDbService.QueryPaginatedAsync<TrackDataModel>(
            $"USER#{username}", "DATE#", QueryOperator.BeginsWith, "GSI3", OwnTracksChecked, null);
        var shares = await Task.WhenAll(tracks.Select(t => _dynamoDbService.QueryAsync<SharedTrackDataModel>(
            $"TRACK#{t.TrackId}", "SHARED#", QueryOperator.BeginsWith)));
        return shares.SelectMany(s => s)
            .Select(s => s.Sk.Replace("SHARED#", ""))
            .Where(recipient => !recipient.Contains('#'))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
