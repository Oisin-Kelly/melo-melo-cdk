import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'
import type { ReactNode } from 'react'
import { albumPath } from '@/lib/links'
import type { AlbumSummary, PaginatedResult } from '@/types/api'
import { formatLength } from '@/utils/format'
import { loadAlbum } from '@/components/player/load-context'
import { CoverArt } from './cover-art'
import { CoverPlay } from './cover-play'
import './media.css'

// An album as a cover-first tile (profile and library shelves): the big cover, then
// its name and length. The whole tile opens the album; hovering it shows play over the cover.
export function AlbumTile({ album }: { album: AlbumSummary }) {
  return (
    <div className="mm-tile mm-play-hover">
      <CoverPlay
        context={{ type: 'ALBUM', id: album.id }}
        load={() => loadAlbum(album.id)}
        name={album.name}
        isEmpty={album.trackCount === 0}
      >
        <CoverArt imageUrl={album.imageUrl} imageBgColor={album.imageBgColor} size="lg" />
      </CoverPlay>
      <VStack gap={0.5}>
        {/* The link stretches over the whole tile (::after); play sits above it */}
        <RouterLink to={albumPath(album)} className="mm-tile-link">
          <Text type="label" weight="semibold" maxLines={1} className="mm-tile-name">
            {album.name}
          </Text>
        </RouterLink>
        <Text type="supporting" color="secondary" maxLines={1}>
          {album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}
          {album.totalDurationSeconds > 0 && ` · ${formatLength(album.totalDurationSeconds)}`}
        </Text>
      </VStack>
    </div>
  )
}

// A horizontally scrolling shelf of tiles
export function TileShelf({ children }: { children: ReactNode }) {
  return <div className="mm-tile-shelf">{children}</div>
}

// A titled, sideways shelf of album tiles (profile and Library); hidden entirely when
// there are none (an empty shelf is just noise). Loads further pages from a trailing
// "More" button.
export function AlbumShelf<T>({
  title,
  query,
  toAlbum,
}: {
  title: string
  query: UseInfiniteQueryResult<InfiniteData<PaginatedResult<T>>>
  toAlbum: (row: T) => AlbumSummary
}) {
  const albums = query.data?.pages.flatMap((page) => page.items.map(toAlbum)) ?? []
  if (query.isPending || query.isError || albums.length === 0) return null

  return (
    <VStack gap={3}>
      <Text type="label" size="sm" weight="semibold" color="secondary">
        {title.toUpperCase()}
      </Text>
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
    </VStack>
  )
}
