import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { HStack } from '@astryxdesign/core/HStack'
import { Item } from '@astryxdesign/core/Item'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useMemo } from 'react'
import { Illustration } from '@/components/illustrations/illustration'
import { CoverArt } from '@/components/media/cover-art'
import { profilePath } from '@/lib/links'
import { nameOf } from '@/types/user'
import { cleanUsernameQuery } from '@/lib/people'
import {
  matchesQuery,
  useLibraryIndex,
  usePeopleSearch,
  type LibraryHit,
} from '../api/search'

const PER_GROUP = 5

const GROUPS: { kind: LibraryHit['kind']; title: string }[] = [
  { kind: 'TRACK', title: 'Tracks' },
  { kind: 'ALBUM', title: 'Albums' },
  { kind: 'PLAYLIST', title: 'Playlists' },
]

function GroupTitle({ children }: { children: string }) {
  return (
    <VStack paddingInline={2} paddingBlockStart={2} paddingBlockEnd={1}>
      <Text type="label" size="sm" weight="semibold" color="secondary">
        {children.toUpperCase()}
      </Text>
    </VStack>
  )
}

type Props = {
  query: string
  /** Called after a result is chosen (close the popover / dialog, clear the field). */
  onPicked: () => void
}

// Grouped results for the header search: People (server), then Tracks, Albums and
// Playlists (matched locally against the prefetched library).
export function SearchResults({ query, onPicked }: Props) {
  const people = usePeopleSearch(query)
  const library = useLibraryIndex(true)

  const matches = useMemo(() => {
    const hits = library.hits.filter((hit) => matchesQuery(hit, query))
    return GROUPS.map((group) => ({
      ...group,
      items: hits.filter((hit) => hit.kind === group.kind).slice(0, PER_GROUP),
    })).filter((group) => group.items.length > 0)
  }, [library.hits, query])

  const peopleItems = people.data ?? []
  const peopleSearchable = cleanUsernameQuery(query).length >= 2
  const isSearchingPeople = peopleSearchable && people.isFetching
  const nothingYet = peopleItems.length === 0 && matches.length === 0
  // Something didn't load: never present that as "no results" — say so, with a retry
  const peopleFailed = peopleSearchable && people.isError && !people.isFetching
  const hasFailure = (library.isComplete && library.hasError) || peopleFailed
  const retryAll = () => {
    library.retry()
    if (peopleFailed) void people.refetch()
  }

  if (nothingYet && (!library.isComplete || isSearchingPeople)) {
    return (
      <Center axis="both" padding={6}>
        <Spinner size="md" aria-label="Searching" />
      </Center>
    )
  }

  if (nothingYet && hasFailure) {
    return (
      <VStack padding={4} gap={2} hAlign="center">
        <Illustration name="searching" size="sm" />
        <Text weight="semibold">Couldn't search everything</Text>
        <Text type="supporting" color="secondary" justify="center">
          Part of your library didn't load, so there may be results we can't show yet.
        </Text>
        <Button label="Retry" size="sm" variant="secondary" onClick={retryAll} />
      </VStack>
    )
  }

  if (nothingYet) {
    return (
      <VStack padding={4} gap={2} hAlign="center">
        <Illustration name="searching" size="sm" />
        <Text weight="semibold">No results for “{query.trim()}”</Text>
        <Text type="supporting" color="secondary" justify="center">
          Search matches names of people, tracks, albums and playlists you can access.
        </Text>
      </VStack>
    )
  }

  return (
    <VStack gap={1} padding={1}>
      {peopleItems.length > 0 && (
        <VStack>
          <GroupTitle>People</GroupTitle>
          {peopleItems.map((user) => (
            <Item
              key={user.username}
              href={profilePath(user.username)}
              onClick={onPicked}
              label={nameOf(user)}
              description={`@${user.username}`}
              startContent={<Avatar size="md" src={user.imageUrl ?? undefined} name={nameOf(user)} tooltip={false} />}
            />
          ))}
        </VStack>
      )}

      {matches.map((group) => (
        <VStack key={group.kind}>
          <GroupTitle>{group.title}</GroupTitle>
          {group.items.map((hit) => (
            <Item
              key={`${hit.kind}:${hit.id}`}
              href={hit.href}
              onClick={onPicked}
              label={hit.name}
              description={hit.by}
              startContent={<CoverArt imageUrl={hit.imageUrl} imageBgColor={hit.imageBgColor} size="sm" />}
            />
          ))}
        </VStack>
      ))}

      {!library.isComplete && (
        <HStack gap={2} padding={2} vAlign="center">
          <Spinner size="sm" />
          <Text type="supporting" color="secondary">
            Still loading your library…
          </Text>
        </HStack>
      )}
      {hasFailure && (
        <HStack gap={2} padding={2} vAlign="center" hAlign="between">
          <Text type="supporting" color="secondary">
            {peopleFailed && !library.hasError
              ? "People couldn't load, so results may be incomplete."
              : "Some of your library couldn't load, so results may be incomplete."}
          </Text>
          <Button label="Retry" size="sm" variant="ghost" onClick={retryAll} />
        </HStack>
      )}
    </VStack>
  )
}
