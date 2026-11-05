import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { SortMenu } from '@/components/lists/sort-menu'
import { FEED_SORT_OPTIONS, type FeedSort, type FeedType } from '../api/feed'
import { ContinueListeningCard } from './continue-listening-card'
import { FeedTypePicker } from './feed-filters'
import { HomeFeed } from './home-feed'

// Home: what's been shared with you, using the full content width. Each section
// loads on its own so a slow or failed one never blocks the rest.
export function HomePage() {
  const [type, setType] = useState<FeedType>('ALL')
  const [sort, setSort] = useState<FeedSort>('newest')

  return (
    <VStack gap={5} width="100%">
      <PageHeader
        title="Home"
        picker={<FeedTypePicker type={type} onChange={setType} />}
        actions={<SortMenu value={sort} options={FEED_SORT_OPTIONS} onChange={setSort} />}
      />
      <ContinueListeningCard />
      <HomeFeed type={type} sort={sort} />
    </VStack>
  )
}
