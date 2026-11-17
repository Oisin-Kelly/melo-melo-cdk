import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { SortMenu } from '@/components/lists/sort-menu'
import { PeopleYouMayKnowPanel } from '@/components/people/people-you-may-know'
import { useHasSidePanel } from '@/hooks/use-has-side-panel'
import { FEED_SORT_OPTIONS, type FeedSort, type FeedType } from '../api/feed'
import { FeedTypePicker } from './feed-filters'
import { HomeFeed } from './home-feed'
import './home.css'

// Home: what's been shared with you. Each section loads on its own so a slow or failed one
// never blocks the rest. On wide screens it's an Astryx Layout with People you may know in
// a panel at its end, divided from the feed top to bottom (like Settings' section list);
// narrower screens show it as a shelf when the feed is empty (HomeFeed).
export function HomePage() {
  const [type, setType] = useState<FeedType>('ALL')
  const [sort, setSort] = useState<FeedSort>('newest')
  const hasSidePanel = useHasSidePanel()

  const feed = (
    <VStack gap={5} width="100%">
      <PageHeader
        title="Home"
        picker={<FeedTypePicker type={type} onChange={setType} />}
        actions={<SortMenu value={sort} options={FEED_SORT_OPTIONS} onChange={setSort} />}
      />
      <HomeFeed type={type} sort={sort} hasSuggestionsShelf={!hasSidePanel} />
    </VStack>
  )
  if (!hasSidePanel) return feed

  return (
    <div className="mm-home">
      <Layout
        height="fill"
        content={<LayoutContent padding={8}>{feed}</LayoutContent>}
        end={
          <LayoutPanel hasDivider padding={0}>
            <aside className="mm-home-panel" aria-label="People you may know">
              <PeopleYouMayKnowPanel />
            </aside>
          </LayoutPanel>
        }
      />
    </div>
  )
}
