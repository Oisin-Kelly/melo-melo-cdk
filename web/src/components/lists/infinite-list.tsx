import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { Fragment, useEffect, type ReactNode } from 'react'
import type { LoadingWhat } from '@/components/feedback/loading-phrases'
import { PageLoader } from '@/components/feedback/page-loader'
import { Illustration } from '@/components/illustrations/illustration'
import { useLoadMoreOnScroll } from '@/hooks/use-load-more-on-scroll'
import type { PaginatedResult } from '@/types/api'
import './lists.css'

type InfiniteListProps<T> = {
  query: UseInfiniteQueryResult<InfiniteData<PaginatedResult<T>>>
  getKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  /** What's loading, for the first-load phrase ("Lining up the tracks…"). */
  loadingWhat?: LoadingWhat
  /** Rendered when there is nothing at all. */
  empty: { title: string; description?: string; icon?: ReactNode; actions?: ReactNode }
  /** Shown once every page is loaded ("You've reached the bottom"). Pass null to hide. */
  endMessage?: string | null
  /** Optional content inserted before an item (e.g. a date divider). */
  renderBefore?: (item: T, index: number) => ReactNode
  gap?: 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6
  isCompact?: boolean
  /** 'grid' lays the items out as a grid of cards (.mm-card-grid) instead of a column. */
  layout?: 'list' | 'grid'
  /** Narrows what's loaded so far (a search box); more pages keep loading as you scroll. */
  filter?: (item: T) => boolean
  /** Shown when the filter matches nothing loaded. */
  noMatch?: string
  /** Re-orders the (filtered) items. Pair with loadAll so it orders the whole list. */
  sort?: (a: T, b: T) => number
  /** Fetch every page before showing any rows, so a sort or search covers the whole
   * list rather than what's loaded so far. */
  loadAll?: boolean
}

// Infinite scrolling over any cursor-paginated endpoint (useInfiniteQuery +
// PaginatedResult). Owns every list state so screens only describe their rows:
// first-load spinner + phrase, empty, inline error with retry, next-page spinner, end of list.
//
// The backend can return a short or even empty page that still has a cursor (rows
// that no longer resolve are dropped server-side). So "empty" means the first page is
// empty AND there is no cursor; otherwise we keep fetching rather than show it.
export function InfiniteList<T>({
  query,
  getKey,
  renderItem,
  loadingWhat,
  empty,
  endMessage = "You've reached the bottom",
  renderBefore,
  gap = 2,
  isCompact,
  layout = 'list',
  filter,
  noMatch = 'No matches',
  sort,
  loadAll = false,
}: InfiniteListProps<T>) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage, isError, isPending, refetch } = query
  const items = data?.pages.flatMap((page) => page.items) ?? []
  const canLoadMore = Boolean(hasNextPage) && !isFetchingNextPage && !isError

  const markerRef = useLoadMoreOnScroll(canLoadMore, () => void fetchNextPage())

  // Pages that came back empty but still have a cursor: keep pulling until there is
  // something to show or the list really ends (the marker can't fire with no rows).
  // With loadAll, keep pulling until the last page whatever came back.
  useEffect(() => {
    if (!isPending && (items.length === 0 || loadAll) && canLoadMore) void fetchNextPage()
  }, [isPending, items.length, loadAll, canLoadMore, fetchNextPage])

  if (isPending) return <PageLoader compact={isCompact} what={loadingWhat} />

  if (isError && items.length === 0) {
    return (
      <EmptyState
        isCompact={isCompact}
        icon={<Illustration name="lost" size={isCompact ? 'sm' : 'md'} />}
        title="Couldn't load this"
        description="Check your connection and try again."
        actions={<Button label="Try again" onClick={() => void refetch()} />}
      />
    )
  }

  if (items.length === 0 && !hasNextPage) {
    return <EmptyState isCompact={isCompact} {...empty} />
  }

  if (loadAll && hasNextPage && !isError) {
    return (
      <Center axis="horizontal" padding={4}>
        <HStack gap={2} vAlign="center" role="status">
          <Spinner size="sm" aria-label="Loading the whole list" />
          <Text type="supporting" color="secondary" aria-hidden="true">
            Loading the whole list
          </Text>
        </HStack>
      </Center>
    )
  }

  const filtered = filter ? items.filter(filter) : items
  const shown = sort ? [...filtered].sort(sort) : filtered
  const rendered = shown.map((item, index) => (
    <Fragment key={getKey(item)}>
      {renderBefore?.(item, index)}
      {renderItem(item, index)}
    </Fragment>
  ))

  return (
    <VStack gap={gap}>
      {layout === 'grid' ? <div className="mm-card-grid">{rendered}</div> : rendered}
      {filter && shown.length === 0 && (
        <Text type="supporting" color="secondary">
          {noMatch}
        </Text>
      )}

      {/* invisible scroll marker that triggers the next page */}
      <div ref={markerRef} aria-hidden="true" />

      {(isFetchingNextPage || (items.length === 0 && hasNextPage)) && (
        <Center axis="horizontal" padding={4}>
          <HStack gap={2} vAlign="center" role="status">
            <Spinner size="sm" aria-label="Loading more" />
            <Text type="supporting" color="secondary" aria-hidden="true">
              Loading more
            </Text>
          </HStack>
        </Center>
      )}

      {isError && items.length > 0 && (
        <Center axis="horizontal" padding={3}>
          <VStack gap={2} hAlign="center">
            <Text type="supporting" color="secondary">
              Couldn't load more.
            </Text>
            <Button label="Retry" size="sm" onClick={() => void fetchNextPage()} />
          </VStack>
        </Center>
      )}

      {!hasNextPage && items.length > 0 && endMessage && (
        <VStack paddingBlock={4}>
          <Divider label={<Text type="supporting" color="secondary">{endMessage}</Text>} />
        </VStack>
      )}
    </VStack>
  )
}
