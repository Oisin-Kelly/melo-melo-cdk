import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useRef, useState } from 'react'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
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

type Props = { type: FeedType; sort: FeedSort }

export function HomeFeed({ type, sort }: Props) {
  const feed = useFeed(type, sort)
  const lastVisit = useLastVisit()
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []

  // Dividers only make sense newest-first and once there is a last visit to compare to
  const showDividers = sort === 'newest' && typeof lastVisit === 'number'
  const isNew = (entry: Entry) => showDividers && entry.sharedAt > (lastVisit as number)
  const hasNew = items.some(isNew)

  return (
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
      renderItem={(entry) => <FeedEntry entry={entry} />}
    />
  )
}
