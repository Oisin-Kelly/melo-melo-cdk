using Adapters.Repositories;
using Domain;
using Ports.Services;

namespace Adapters.Tests.Repositories;

// Seeds data the same way production writes it (PostConfirmation's profile + likes playlist,
// the real TrackRepository.CreateTrackAsync) and reads back raw items to check counters.
// Every helper mints fresh GUID-based names, so tests never collide.
public sealed class Seed(IDynamoDBService db)
{
    // The real repository graph, wired the same way AddMeloMeloData resolves it
    public UserRepository Users { get; } = new(db);
    public FollowRepository Follows => new(db);
    public LikeRepository Likes => new(db);
    public SharedTrackRepository Shares => new(db);
    public UploadStatusRepository Uploads => new(db);
    public TrackRepository Tracks => new(db, Users, Likes, Shares, Uploads, Links);
    public ShareLinkRepository Links => new(db);
    public AlbumTracklistRepository AlbumTracklist => new(db);
    public AlbumShareRepository AlbumShares => new(db);
    public AlbumLikeRepository AlbumLikes => new(db);
    public AlbumRepository Albums => new(db, AlbumTracklist, AlbumShares, AlbumLikes, Links);

    public static string NewName(string prefix = "u") => $"{prefix}{Guid.NewGuid():N}"[..20];

    public async Task<string> UserAsync(string? username = null,
        string incomingShares = IncomingSharesSetting.Everyone)
    {
        username ??= NewName();
        username = username.ToLowerInvariant(); // signup only accepts lowercase
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var userTx = db.CreateTransactionPart<UserDataModel>();
        userTx.AddSaveItem(new UserDataModel
        {
            Pk = $"USER#{username}",
            Sk = "PROFILE",
            Gsi1Pk = $"EMAIL#{username}@example.com",
            Gsi1Sk = "PROFILE",
            Gsi3Pk = UserRepository.SearchIndexPk,
            Gsi3Sk = UserRepository.SearchIndexSk(username),
            Username = username,
            DisplayName = username,
            FollowingCount = 0,
            FollowerCount = 0,
            IncomingShares = incomingShares,
            CreatedAt = now,
        });
        var likesTx = db.CreateTransactionPart<PlaylistDataModel>();
        likesTx.AddSaveItem(PlaylistRepository.BuildLikesPlaylistItem(username, now));
        await db.ExecuteTransactWriteAsync(userTx, likesTx);

        return username;
    }

    public async Task<string> TrackAsync(string owner, int durationSeconds = 180, params string[] sharedWith)
    {
        var trackId = Guid.NewGuid().ToString("N");
        var input = new ProcessTrackInput
        {
            Username = owner,
            Name = $"Track {trackId[..6]}",
            AudioKey = $"{owner}/{trackId}.wav",
            SharedWith = [.. sharedWith],
        };
        await Tracks.CreateTrackAsync(trackId, input, new AudioProcessingResult(durationSeconds), null);
        return trackId;
    }

    public async Task<string> AlbumAsync(string owner, params string[] trackIds)
    {
        var albumId = Guid.NewGuid().ToString("N");
        await Albums.CreateAlbumAsync(albumId, owner, $"Album {albumId[..6]}", null, null, trackIds);
        return albumId;
    }

    public Task<TrackDataModel?> TrackItemAsync(string owner, string trackId) =>
        db.GetFromDynamoAsync<TrackDataModel>($"USER#{owner}", $"TRACK#{trackId}");

    public Task<PlaylistDataModel?> LikesPlaylistAsync(string username) =>
        db.GetFromDynamoAsync<PlaylistDataModel>($"USER#{username}", "PLAYLIST#likes");

    public Task<PlaylistDataModel?> PlaylistItemAsync(string username, string playlistId) =>
        db.GetFromDynamoAsync<PlaylistDataModel>($"USER#{username}", $"PLAYLIST#{playlistId}");

    public Task<AlbumDataModel?> AlbumItemAsync(string owner, string albumId) =>
        db.GetFromDynamoAsync<AlbumDataModel>($"USER#{owner}", $"ALBUM#{albumId}");

    public Task<UserDataModel?> ProfileAsync(string username) =>
        db.GetFromDynamoAsync<UserDataModel>($"USER#{username}", "PROFILE");
}
