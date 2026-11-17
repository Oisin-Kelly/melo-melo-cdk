import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import { TimeAgo } from '@/components/feedback/time-ago'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { BackButton } from '@/components/navigation/back-button'
import { matchesPerson } from '@/components/people/matches-person'
import { PeopleSearch, PersonCard, PersonGrid } from '@/components/people/person-card'
import { isNotFound } from '@/lib/api-client'
import { trackPath, trackPeoplePath, useCanonicalPath } from '@/lib/links'
import { useTrack, useTrackLikers, useTrackRecipients } from '../api/tracks'

export type TrackPeopleKind = 'shared-with' | 'likes'

const TITLE: Record<TrackPeopleKind, string> = { 'shared-with': 'Shared with', likes: 'Liked by' }

// /{owner}/{slug}/shared-with and /likes: the whole list behind a track page's "See all",
// as person cards with a search box over them.
// Owner-only, like the sections it expands (anyone else's request is a 404, shown as
// not available).
export function TrackPeoplePage({ trackId, kind }: { trackId: string; kind: TrackPeopleKind }) {
  const track = useTrack(trackId)
  const [search, setSearch] = useState('')
  useCanonicalPath(track.data && trackPeoplePath(track.data, kind))

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <BackButton fallback={track.data ? trackPath(track.data) : `/tracks/${trackId}`} className="mm-page-back" />
        <VStack gap={0.5}>
          <Heading level={1}>{TITLE[kind]}</Heading>
          {track.data && (
            <Text type="supporting" color="secondary" maxLines={1}>
              {track.data.name}
            </Text>
          )}
        </VStack>
      </VStack>
      <PeopleSearch value={search} onChange={setSearch} />
      {kind === 'likes' ? <AllLikers trackId={trackId} search={search} /> : <AllRecipients trackId={trackId} search={search} />}
    </VStack>
  )
}

function Unavailable({ retry, isMissing }: { retry: () => void; isMissing: boolean }) {
  return isMissing ? (
    <EmptyState
      icon={<Illustration name="lost" />}
      title="This list isn't available"
      description="Only the track's owner can see who it's shared with and who liked it."
      actions={<Button label="Go home" href="/" />}
    />
  ) : (
    <EmptyState
      icon={<Illustration name="lost" />}
      title="Couldn't load this list"
      description="Check your connection and try again."
      actions={<Button label="Try again" onClick={retry} />}
    />
  )
}

function AllRecipients({ trackId, search }: { trackId: string; search: string }) {
  const recipients = useTrackRecipients(trackId, true)
  if (recipients.isPending) return <PageLoader what="sharedWith" />
  if (recipients.isError) return <Unavailable retry={() => void recipients.refetch()} isMissing={isNotFound(recipients.error)} />
  if (recipients.data.length === 0) {
    return <EmptyState icon={<Illustration name="music" />} title="Not shared with anyone yet" />
  }
  const matching = recipients.data.filter((recipient) => matchesPerson(recipient.user, search))
  if (matching.length === 0) {
    return (
      <Text type="supporting" color="secondary">
        No one matches “{search.trim()}”.
      </Text>
    )
  }
  return (
    <PersonGrid>
      {matching.map((recipient) => (
        <PersonCard
          key={recipient.user.username}
          user={recipient.user}
          detail={
            <>
              Shared <TimeAgo ms={recipient.sharedAt} />
            </>
          }
        />
      ))}
    </PersonGrid>
  )
}

function AllLikers({ trackId, search }: { trackId: string; search: string }) {
  const likers = useTrackLikers(trackId, true)
  if (likers.isError && isNotFound(likers.error)) return <Unavailable retry={() => void likers.refetch()} isMissing />
  return (
    <InfiniteList
      query={likers}
      getKey={(liker) => liker.user.username}
      loadingWhat="likes"
      layout="grid"
      filter={(liker) => matchesPerson(liker.user, search)}
      noMatch={`No one matches “${search.trim()}”.`}
      renderItem={(liker) => (
        <PersonCard
          user={liker.user}
          detail={
            <>
              Liked <TimeAgo ms={liker.likedAt} />
            </>
          }
        />
      )}
      empty={{ title: 'No likes yet', icon: <Illustration name="music" /> }}
    />
  )
}
