import { Button } from '@astryxdesign/core/Button'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'
import type { ReactNode } from 'react'
import { albumPath } from '@/lib/links'
import type { AlbumSummary, PaginatedResult } from '@/types/api'
import { formatLength } from '@/utils/format'
import { CoverArt } from './cover-art'
import './media.css'

// An album as a cover-first tile (profile and library shelves): the big cover, then
// its name and length. The whole tile is the link.
export function AlbumTile({ album }: { album: AlbumSummary }) {
  return (
    <RouterLink to={albumPath(album)} className="mm-tile">
      <CoverArt imageUrl={album.imageUrl} imageBgColor={album.imageBgColor} size="lg" />
      <VStack gap={0.5}>
        <Text type="label" weight="semibold" maxLines={1} className="mm-tile-name">
          {album.name}
        </Text>
        <Text type="supporting" color="secondary" maxLines={1}>
          {album.trackCount} {album.trackCount === 1 ? 'track' : 'tracks'}
          {album.totalDurationSeconds > 0 && ` · ${formatLength(album.totalDurationSeconds)}`}
        </Text>
      </VStack>
    </RouterLink>
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
