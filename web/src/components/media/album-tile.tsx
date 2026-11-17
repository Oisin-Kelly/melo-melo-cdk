import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'
import type { ReactNode } from 'react'
import { albumPath, playlistPath } from '@/lib/links'
import type { Playlist } from '@/lib/playlists'
import type { AlbumSummary, PaginatedResult } from '@/types/api'
import { formatLength } from '@/utils/format'
import { loadAlbum, loadPlaylist } from '@/components/player/load-context'
import { CoverArt } from './cover-art'
import { CoverPlay } from './cover-play'
import './media.css'

type Collection = {
  id: string
  name: string
  imageUrl: string | null
  imageBgColor: string | null
  trackCount: number
  totalDurationSeconds: number
}

// A cover-first tile (profile, library and track-page shelves): the big cover, then its
// name and size. The whole tile opens it; hovering it shows play over the cover.
function CoverTile({
  item,
  href,
  play,
}: {
  item: Collection
  href: string
  play: Pick<Parameters<typeof CoverPlay>[0], 'context' | 'load'>
}) {
  return (
    <div className="mm-tile mm-play-hover">
      <CoverPlay {...play} name={item.name} isEmpty={item.trackCount === 0}>
        <CoverArt imageUrl={item.imageUrl} imageBgColor={item.imageBgColor} size="lg" />
      </CoverPlay>
      <VStack gap={0.5}>
        {/* The link stretches over the whole tile (::after); play sits above it */}
        <RouterLink to={href} className="mm-tile-link">
          <Text type="label" weight="semibold" maxLines={1} className="mm-tile-name">
            {item.name}
          </Text>
        </RouterLink>
        <Text type="supporting" color="secondary" maxLines={1}>
          {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
          {item.totalDurationSeconds > 0 && ` · ${formatLength(item.totalDurationSeconds)}`}
        </Text>
      </VStack>
    </div>
  )
}

export function AlbumTile({ album }: { album: AlbumSummary }) {
  return (
    <CoverTile
      item={album}
      href={albumPath(album)}
      play={{ context: { type: 'ALBUM', id: album.id }, load: () => loadAlbum(album.id) }}
    />
  )
}

// One of your own playlists (`me` builds its URL)
export function PlaylistTile({ playlist, me }: { playlist: Playlist; me: string }) {
  return (
    <CoverTile
      item={playlist}
      href={playlistPath(playlist, me)}
      play={{ context: { type: 'PLAYLIST', id: playlist.id }, load: () => loadPlaylist(playlist.id, me) }}
    />
  )
}

// A horizontally scrolling shelf of tiles
export function TileShelf({ children }: { children: ReactNode }) {
  return <div className="mm-tile-shelf">{children}</div>
}

// A titled, sideways shelf of album tiles (profile and Library); hidden entirely when
// there are none (an empty shelf is just noise) — unless it has an `action` (your own
// albums' New album), which keeps the title row and says `emptyText` instead. Loads
// further pages from a trailing "More" button.
export function AlbumShelf<T>({
  title,
  query,
  toAlbum,
  action,
  emptyText,
}: {
  title: string
  query: UseInfiniteQueryResult<InfiniteData<PaginatedResult<T>>>
  toAlbum: (row: T) => AlbumSummary
  /** A button at the end of the title row; with one, the shelf shows even when empty. */
  action?: ReactNode
  emptyText?: string
}) {
  const albums = query.data?.pages.flatMap((page) => page.items.map(toAlbum)) ?? []
  if (query.isPending || query.isError || (albums.length === 0 && !action)) return null

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Text type="label" size="sm" weight="semibold" color="secondary">
            {title.toUpperCase()}
          </Text>
        </StackItem>
        {action}
      </HStack>
      {albums.length === 0 && emptyText && (
        <Text type="body" color="secondary">
          {emptyText}
        </Text>
      )}
      {albums.length > 0 && (
        <TileShelf>
          {albums.map((album) => (
            <AlbumTile key={album.id} album={album} />
          ))}
          {query.hasNextPage && (
            <Button
              label="More"
              variant="ghost"
              isLoading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            />
          )}
        </TileShelf>
      )}
    </VStack>
  )
}
