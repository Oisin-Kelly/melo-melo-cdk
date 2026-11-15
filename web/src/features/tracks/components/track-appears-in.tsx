import { List, ListItem } from '@astryxdesign/core/List'
import { AlbumTile, TileShelf } from '@/components/media/album-tile'
import { CoverArt } from '@/components/media/cover-art'
import { CoverPlay } from '@/components/media/cover-play'
import { loadPlaylist } from '@/components/player/load-context'
import { playlistPath } from '@/lib/links'
import type { AlbumSummary } from '@/types/api'
import type { Playlist } from '@/lib/playlists'

const tracks = (count: number) => `${count} ${count === 1 ? 'track' : 'tracks'}`

// A track page's "In albums": the albums holding it that you can open, as tiles
export function InAlbums({ albums }: { albums: AlbumSummary[] }) {
  return (
    <TileShelf>
      {albums.map((album) => (
        <AlbumTile key={album.id} album={album} />
      ))}
    </TileShelf>
  )
}

// …and "In your playlists": rows like Library's
export function InPlaylists({ playlists, me }: { playlists: Playlist[]; me: string }) {
  return (
    <List>
      {playlists.map((playlist) => (
        <ListItem
          key={playlist.id}
          href={playlistPath(playlist, me)}
          className="mm-play-hover"
          startContent={
            <CoverPlay
              context={{ type: 'PLAYLIST', id: playlist.id }}
              load={() => loadPlaylist(playlist.id, me)}
              name={playlist.name}
              isEmpty={playlist.trackCount === 0}
            >
              <CoverArt imageUrl={playlist.imageUrl} imageBgColor={playlist.imageBgColor} size="sm" />
            </CoverPlay>
          }
          label={playlist.name}
          description={`Playlist · ${tracks(playlist.trackCount)}`}
        />
      ))}
    </List>
  )
}
