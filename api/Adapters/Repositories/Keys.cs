namespace Adapters.Repositories;

// Primary keys of the owner-partitioned meta items, which most repositories touch (counters,
// lookups, deletes). One place to spell them, instead of $"USER#{u}"/$"TRACK#{id}" literals.
// Ids are expected already normalised (lowercase) by the caller.
internal static class Keys
{
    public static (string Pk, string Sk) Profile(string username) => ($"USER#{username}", "PROFILE");

    public static (string Pk, string Sk) Track(string ownerUsername, string trackId) =>
        ($"USER#{ownerUsername}", $"TRACK#{trackId}");

    public static (string Pk, string Sk) Album(string ownerUsername, string albumId) =>
        ($"USER#{ownerUsername}", $"ALBUM#{albumId}");

    public static (string Pk, string Sk) Playlist(string username, string playlistId) =>
        ($"USER#{username}", $"PLAYLIST#{playlistId}");

    public static (string Pk, string Sk) LikesPlaylist(string username) =>
        Playlist(username, PlaylistRepository.LikesPlaylistId);
}
