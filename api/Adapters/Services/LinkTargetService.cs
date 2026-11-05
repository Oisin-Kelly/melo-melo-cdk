using Domain;
using Ports.Repositories;
using Ports.Services;

namespace Adapters.Services;

public sealed class LinkTargetService : ILinkTargetService
{
    private readonly ITrackRepository _trackRepository;
    private readonly ISharedTrackRepository _sharedTrackRepository;
    private readonly IAlbumRepository _albumRepository;
    private readonly IAlbumTracklistRepository _albumTracklistRepository;
    private readonly IAlbumShareRepository _albumShareRepository;

    public LinkTargetService(ITrackRepository trackRepository, ISharedTrackRepository sharedTrackRepository,
        IAlbumRepository albumRepository, IAlbumTracklistRepository albumTracklistRepository,
        IAlbumShareRepository albumShareRepository)
    {
        _trackRepository = trackRepository;
        _sharedTrackRepository = sharedTrackRepository;
        _albumRepository = albumRepository;
        _albumTracklistRepository = albumTracklistRepository;
        _albumShareRepository = albumShareRepository;
    }

    public async Task<LinkItem?> GetAsync(string kind, string id)
    {
        switch (kind)
        {
            case ShareLinkKind.Track:
            {
                var track = await _trackRepository.GetTrackAsync(id);
                if (track is null)
                    return null;

                return new LinkItem
                {
                    Kind = kind,
                    Id = track.Id,
                    Owner = track.Owner.Username,
                    Name = track.TrackName,
                    Slug = track.Slug,
                    ImageUrl = track.ImageUrl,
                    ImageBgColor = track.ImageBgColor,
                    Genre = track.Genre,
                    Duration = track.Duration,
                    Tracks = [new LinkItemTrack(track.Id, track.TrackName, track.Duration)],
                };
            }
            case ShareLinkKind.Album:
            {
                var album = await _albumRepository.GetAlbumByIdAsync(id);
                if (album?.OwnerUsername is null)
                    return null;

                // Albums hold at most MaxTracksPerAlbum (50), so one page is the whole tracklist.
                // The owner stands in as the viewer: likedByMe isn't used here.
                var tracks = await _albumTracklistRepository.GetAlbumTracksAsync(
                    album.Id, album.OwnerUsername, 100, null);

                return new LinkItem
                {
                    Kind = kind,
                    Id = album.Id,
                    Owner = album.OwnerUsername,
                    Name = album.Name,
                    Slug = album.Slug,
                    ImageUrl = album.ImageUrl,
                    ImageBgColor = album.ImageBgColor,
                    Duration = album.TotalDurationSeconds,
                    Tracks = tracks.Items
                        .Select(t => new LinkItemTrack(t.Id, t.Name, t.Duration))
                        .ToList(),
                };
            }
            default:
                return null;
        }
    }

    public async Task<bool> HasAccessAsync(LinkItem item, string username)
    {
        if (item.Owner == username)
            return true;

        return item.Kind == ShareLinkKind.Track
            ? await _sharedTrackRepository.IsTrackAccessibleToUser(item.Id, username)
            : await _albumShareRepository.IsAlbumSharedWithUserAsync(item.Id, username);
    }
}
