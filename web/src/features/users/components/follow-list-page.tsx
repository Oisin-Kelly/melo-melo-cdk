import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { BackButton } from '@/components/navigation/back-button'
import { matchesPerson } from '@/components/people/matches-person'
import { PeopleSearch, PersonCard } from '@/components/people/person-card'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'
import { isForbidden, useFollowList, type FollowListKind } from '../api/profile'

const TITLE: Record<FollowListKind, string> = { followers: 'Followers', following: 'Following' }

// /:username/followers and /following: the people, newest first, as cards (big photo,
// name, @username) linking to their profiles, with a search box over them. A private
// list is a 403, shown as such rather than as an error.
export function FollowListPage({ kind }: { kind: FollowListKind }) {
  const me = useUsername()
  const username = (useParams().username ?? '').toLowerCase()
  const list = useFollowList(username, kind)
  const isMine = username === me
  const [search, setSearch] = useState('')

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <BackButton fallback={profilePath(username)} className="mm-page-back" />
        <VStack gap={0.5}>
          <Heading level={1}>{TITLE[kind]}</Heading>
          <Text type="supporting" color="secondary">
            @{username}
          </Text>
        </VStack>
      </VStack>

      {!isForbidden(list.error) && <PeopleSearch value={search} onChange={setSearch} />}

      {isForbidden(list.error) ? (
        <EmptyState
          icon={<Illustration name="music" />}
          title="This list is private"
          description={`@${username} keeps who ${kind === 'followers' ? 'follows them' : 'they follow'} to themselves.`}
        />
      ) : (
        <InfiniteList
          loadingWhat="people"
          query={list}
          getKey={(person) => person.username}
          layout="grid"
          filter={(person) => matchesPerson(person, search)}
          noMatch={`No one matches “${search.trim()}”.`}
          renderItem={(person) => <PersonCard user={person} />}
          empty={{
            title: kind === 'followers' ? 'No followers yet' : 'Not following anyone yet',
            description:
              kind === 'followers'
                ? isMine
                  ? 'When people follow you, they show up here.'
                  : `No one follows @${username} yet.`
                : isMine
                  ? 'People you follow show up here.'
                  : `@${username} isn't following anyone yet.`,
            icon: <Illustration name="music" size="sm" />,
          }}
        />
      )}
    </VStack>
  )
}
