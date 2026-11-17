import { Heading } from '@astryxdesign/core/Heading'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useSearchParams } from 'react-router'
import { PeopleYouMayKnow } from '@/components/people/people-you-may-know'
import { SEARCH_PLACEHOLDER } from './global-search'
import { SearchResults } from './search-results'

// The phone Search tab (also reachable at /search on desktop). The query lives in
// ?q=, so going back from a result returns to the same results.
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''

  return (
    <VStack gap={4}>
      <Heading level={1}>Search</Heading>
      <TextInput
        label="Search"
        isLabelHidden
        placeholder={SEARCH_PLACEHOLDER}
        startIcon={MagnifyingGlassIcon}
        value={query}
        hasClear
        hasAutoFocus={!query}
        width="100%"
        onChange={(value) => setParams(value ? { q: value } : {}, { replace: true })}
      />
      {query.trim() ? <SearchResults query={query} onPicked={() => {}} /> : <PeopleYouMayKnow />}
    </VStack>
  )
}
