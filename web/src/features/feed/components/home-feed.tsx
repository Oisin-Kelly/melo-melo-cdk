import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useRef, useState } from 'react'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { PeopleYouMayKnow } from '@/components/people/people-you-may-know'
import { feedContext } from '@/components/player/load-context'
import { TrackListPlayback } from '@/components/player/track-list-playback'
import { useMe } from '@/lib/me'
import { useFeed, useMarkSeen, type FeedEntry as Entry, type FeedSort, type FeedType } from '../api/feed'
import { FeedEntry } from './feed-entry'

function SectionLabel({ children, isAccent }: { children: string; isAccent?: boolean }) {
  return (
    <VStack paddingBlockStart={2}>
      <Text type="label" size="sm" weight="semibold" color={isAccent ? 'accent' : 'secondary'}>
        {children.toUpperCase()}
      </Text>
    </VStack>
  )
}

// Captures lastSeenAt from the first successful profile load and keeps that value
// for the whole visit, *then* bumps it server-side. Re-deriving it from the live
// profile would move the divider to "now" while the user is looking at it.
function useLastVisit(): number | null | undefined {
  const me = useMe()
  const markSeen = useMarkSeen()
  const [lastVisit, setLastVisit] = useState<number | null | undefined>(undefined)
  const bumped = useRef(false)

  useEffect(() => {
    if (!me.isSuccess || bumped.current) return
    bumped.current = true
    setLastVisit(me.data.lastSeenAt ?? null) // null: first visit, no divider
    markSeen.mutate()
  }, [me.isSuccess, me.data, markSeen])

  return lastVisit // undefined while the profile is still loading
}

type Props = {
  type: FeedType
  sort: FeedSort
  /** Nothing shared yet: People you may know as a shelf (off when Home has its side panel) */
  hasSuggestionsShelf?: boolean
}

export function HomeFeed({ type, sort, hasSuggestionsShelf = true }: Props) {
  const feed = useFeed(type, sort)
  const lastVisit = useLastVisit()
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []

  // Shared since your last visit (none on a first visit: there's nothing to compare to).
  // Its dot shows in any order; the dividers only make sense newest-first.
  const isUnseen = (entry: Entry) => typeof lastVisit === 'number' && entry.sharedAt > lastVisit
  const showDividers = sort === 'newest'
  const isNew = (entry: Entry) => showDividers && isUnseen(entry)
  const hasNew = items.some(isNew)

  const isEmpty = feed.isSuccess && items.length === 0 && !feed.hasNextPage

  // A track card plays the feed's loaded tracks from that card on (albums play on their own)
  const feedTracks = items.flatMap((entry) => (entry.track ? [entry.track] : []))

  return (
    <TrackListPlayback context={feedContext(type, sort)} tracks={feedTracks}>
      <InfiniteList
        loadingWhat="home"
        query={feed}
        getKey={(entry) => `${entry.type}:${entry.track?.id ?? entry.album?.id}`}
        gap={5}
        empty={{
          title: type === 'ALL' ? 'Nothing shared with you yet' : `No ${type === 'TRACK' ? 'tracks' : 'albums'} shared with you yet`,
          description: 'When friends share music with you, it lands here.',
          icon: <Illustration name="new-shares" />,
        }}
        endMessage="You're all caught up"
        renderBefore={(entry, index) => {
          if (!hasNew) return null
          if (index === 0 && isNew(entry)) return <SectionLabel isAccent>New since your last visit</SectionLabel>
          if (index > 0 && !isNew(entry) && isNew(items[index - 1])) return <SectionLabel>Earlier</SectionLabel>
          return null
        }}
        renderItem={(entry) => <FeedEntry entry={entry} isNew={isUnseen(entry)} />}
      />
      {/* Nothing shared with you yet: people you may know, so there soon is */}
      {isEmpty && hasSuggestionsShelf && <PeopleYouMayKnow />}
    </TrackListPlayback>
  )
}
