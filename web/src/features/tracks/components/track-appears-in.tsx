import { AlbumTile, PlaylistTile, TileShelf } from '@/components/media/album-tile'
import type { Playlist } from '@/lib/playlists'
import type { AlbumSummary } from '@/types/api'

// A track page's "In albums" and "In your playlists": big cover tiles in a sideways
// shelf, like a profile's albums

export function InAlbums({ albums }: { albums: AlbumSummary[] }) {
  return (
    <TileShelf>
      {albums.map((album) => (
        <AlbumTile key={album.id} album={album} />
      ))}
    </TileShelf>
  )
}

export function InPlaylists({ playlists, me }: { playlists: Playlist[]; me: string }) {
  return (
    <TileShelf>
      {playlists.map((playlist) => (
        <PlaylistTile key={playlist.id} playlist={playlist} me={me} />
      ))}
    </TileShelf>
  )
}
