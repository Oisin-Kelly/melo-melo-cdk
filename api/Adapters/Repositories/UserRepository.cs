using Amazon.DynamoDBv2.DocumentModel;
using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Repositories;

public sealed class UserRepository : IUserRepository
{
    public const string SearchIndexPk = "USERS";
    public static string SearchIndexSk(string username) => $"USERNAME#{username.ToLowerInvariant()}";

    private readonly IDynamoDBService _dynamoDbService;

    public UserRepository(IDynamoDBService dynamoDbService)
    {
        _dynamoDbService = dynamoDbService;
    }

    public async Task<User?> GetUserByUsername(string username)
    {
        var userDataModel = await _dynamoDbService.GetFromDynamoAsync<UserDataModel>($"USER#{username}", "PROFILE");
        return userDataModel;
    }

    public async Task<User?> UpdateUser(User user, bool clearImage)
    {
        var builder = new UpdateExpressionBuilder();

        builder.AddNullableString("displayName", "dn", user.DisplayName);
        builder.AddNullableString("firstName", "fn", user.FirstName);
        builder.AddNullableString("lastName", "ln", user.LastName);
        builder.AddNullableString("country", "ctr", user.Country);
        builder.AddNullableString("city", "ct", user.City);
        builder.AddNullableString("bio", "bio", user.Bio);

        HandleImageUpdate(builder, user, clearImage);

        builder.AddValue("followersPrivate", "fp", user.FollowersPrivate);
        builder.AddValue("followingsPrivate", "fip", user.FollowingsPrivate);

        if (user.IncomingShares is not null)
            builder.AddValue("incomingShares", "ish", user.IncomingShares);

        if (builder.IsEmpty)
            return await GetUserByUsername(user.Username);

        var updateTransaction = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        updateTransaction.AddSaveItem($"USER#{user.Username}", "PROFILE", builder.Build());

        await _dynamoDbService.ExecuteTransactWriteAsync(updateTransaction);
        return await GetUserByUsername(user.Username);
    }

    public async Task<(long? LastSeenAt, long? ActivitySeenAt)> GetSeenMarkersAsync(string username)
    {
        var markers = await _dynamoDbService.GetFromDynamoAsync<SeenMarkersDataModel>($"USER#{username}", "PROFILE");
        return (markers?.LastSeenAt, markers?.ActivitySeenAt);
    }

    public Task MarkSeenAsync(string username)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var tx = _dynamoDbService.CreateTransactionPart<UserDataModel>();
        tx.AddSaveItem(
            $"USER#{username}", "PROFILE",
            new Expression
            {
                ExpressionStatement = "SET #a = :v",
                ExpressionAttributeNames = new Dictionary<string, string> { { "#a", "lastSeenAt" } },
                ExpressionAttributeValues = new Dictionary<string, DynamoDBEntry> { { ":v", now } },
            });
        return _dynamoDbService.ExecuteTransactWriteAsync(tx);
    }

    private void HandleImageUpdate(UpdateExpressionBuilder builder, User user, bool clearImage)
    {
        if (clearImage)
        {
            builder.RemoveField("imageUrl", "img");
            builder.RemoveField("imageBgColor", "ibc");

            return;
        }

        if (!string.IsNullOrWhiteSpace(user.ImageUrl))
            builder.AddNullableString("imageUrl", "img", user.ImageUrl);
        if (!string.IsNullOrWhiteSpace(user.ImageBgColor))
            builder.AddNullableString("imageBgColor", "ibc", user.ImageBgColor);
    }

    public async Task<PaginatedResult<UserSummary>> SearchUsersAsync(string prefix, int pageSize, string? cursor)
    {
        // GSI3 projects ALL, so matches come back as full profiles — no hydration step.
        var (profiles, nextToken) = await _dynamoDbService.QueryPaginatedAsync<UserDataModel>(
            hashKey: SearchIndexPk,
            rangeKey: SearchIndexSk(prefix),
            queryOperator: QueryOperator.BeginsWith,
            indexName: "GSI3",
            pageSize: pageSize,
            paginationToken: cursor,
            scanIndexForward: true
        );

        return new PaginatedResult<UserSummary>
        {
            Items = profiles.Select(UserSummary.From).ToList(),
            NextCursor = nextToken,
        };
    }

    public async Task<List<string>> GetValidatedRecipientsAsync(List<string> usernames, string senderUsername)
    {
        // Usernames are stored lowercase, so lowercasing what was typed makes "Bob" an exact key
        var sender = senderUsername.ToLowerInvariant();
        var distinct = usernames
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Select(u => u.Trim().ToLowerInvariant())
            .Where(u => u != sender)
            .Distinct()
            .ToList();

        if (distinct.Count == 0)
            return [];

        var foundUsers = await _dynamoDbService.BatchGetAsync<UserDataModel>(distinct.Select(Keys.Profile));

        var allowed = new List<string>();
        var followChecks = new List<(string Username, Task<bool> Follows)>();

        foreach (var user in foundUsers)
        {
            switch (user.IncomingShares)
            {
                case IncomingSharesSetting.None:
                    break;
                case IncomingSharesSetting.Following:
                    followChecks.Add((user.Username, FollowRecords.IsFollowingAsync(_dynamoDbService, senderUsername, user.Username)));
                    break;
                default: // everyone
                    allowed.Add(user.Username);
                    break;
            }
        }

        await Task.WhenAll(followChecks.Select(c => c.Follows));
        allowed.AddRange(
            followChecks
                .Where(c => c.Follows.Result)
                .Select(c => c.Username)
            );

        return allowed;
    }
}
