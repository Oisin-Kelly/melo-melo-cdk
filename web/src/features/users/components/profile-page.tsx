import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { VStack } from '@astryxdesign/core/VStack'
import { PlusIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { useAlbumEditor } from '@/components/albums/album-editor-context'
import { PageLoader } from '@/components/feedback/page-loader'
import { TimeAgo } from '@/components/feedback/time-ago'
import { Illustration } from '@/components/illustrations/illustration'
import { InfiniteList } from '@/components/lists/infinite-list'
import { AlbumShelf } from '@/components/media/album-tile'
import { DetailSection, ExpandableText } from '@/components/media/detail-section'
import { TrackRow } from '@/components/media/media-rows'
import { myTracksContext, sharedFromContext } from '@/components/player/load-context'
import { TrackListPlayback } from '@/components/player/track-list-playback'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { isNotFound } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { nameOf, type User } from '@/types/user'
import {
  useAlbumsSharedFrom,
  useMyAlbums,
  useMyTracks,
  useTracksSharedFrom,
  useUser,
} from '../api/profile'
import { ProfileHeader } from './profile-header'

// /u/:username. Someone else: what they've shared with you (albums, then tracks). You:
// what you've made (your albums, then your tracks). Each section loads on its own.
export function ProfilePage() {
  const me = useUsername()
  const username = (useParams().username ?? '').toLowerCase()
  const isMe = username === me
  const user = useUser(username)

  if (user.isPending) return <PageLoader what="profile" />
  if (user.isError) {
    return (
      <EmptyState
        icon={<Illustration name="music" />}
        title={isNotFound(user.error) ? 'No one here' : "Couldn't load this profile"}
        description={isNotFound(user.error) ? `There's no one called @${username}.` : 'Please try again.'}
        actions={
          isNotFound(user.error) ? (
            <Button label="Go home" variant="secondary" href="/" />
          ) : (
            <Button label="Try again" variant="secondary" onClick={() => void user.refetch()} />
          )
        }
      />
    )
  }

  return (
    <VStack gap={5} width="100%">
      <ProfileHeader user={user.data} isMe={isMe} />
      {user.data.bio && (
        <DetailSection title="Bio">
          <ExpandableText text={user.data.bio} />
        </DetailSection>
      )}
      {isMe ? <OwnSections /> : <SharedWithYouSections user={user.data} />}
    </VStack>
  )
}

function SharedWithYouSections({ user }: { user: User }) {
  const albums = useAlbumsSharedFrom(user.username, true)
  const tracks = useTracksSharedFrom(user.username, true)
  const name = nameOf(user)

  return (
    <>
      <AlbumShelf
        title="Albums shared with you"
        query={albums}
        toAlbum={(row) => row.album}
      />
      <Section title="Tracks shared with you">
        <TrackListPlayback
          context={sharedFromContext(user)}
          tracks={tracks.data?.pages.flatMap((page) => page.items.map((row) => row.track)) ?? []}
        >
          <InfiniteList
            loadingWhat="tracks"
            query={tracks}
            getKey={(row) => row.track.id}
            renderItem={(row) => (
              <VStack gap={1}>
                {row.caption && (
                  <ExpandableText text={`“${row.caption}”`} type="supporting" color="secondary" />
                )}
                <TrackRow
                  track={row.track}
                  aside={
                    <Text type="supporting" color="secondary">
                      <TimeAgo ms={row.sharedAt} />
                    </Text>
                  }
                />
              </VStack>
            )}
            empty={{
              title: 'Nothing shared yet',
              description: `When ${name} shares a track with you, it shows up here.`,
              icon: <Illustration name="music" size="sm" />,
            }}
          />
        </TrackListPlayback>
      </Section>
    </>
  )
}

function OwnSections() {
  const albumEditor = useAlbumEditor()
  const albums = useMyAlbums(true)
  const tracks = useMyTracks(true)
  const me = useUsername()
  // The Your tracks table is for wider screens
  const isMobile = useIsMobile()

  return (
    <>
      <AlbumShelf
        title="Your albums"
        query={albums}
        toAlbum={(album) => album}
        emptyText="Group your tracks into an album to share them together."
        action={
          <Button
            label="New album"
            variant="secondary"
            size="sm"
            icon={<Icon icon={PlusIcon} />}
            onClick={() => albumEditor.create()}
          />
        }
      />
      <Section
        title="Your tracks"
        action={
          !isMobile && (
            <Link href="/tracks" color="secondary">
              Manage
            </Link>
          )
        }
      >
        <TrackListPlayback
          context={myTracksContext(me)}
          tracks={tracks.data?.pages.flatMap((page) => page.items) ?? []}
        >
          <InfiniteList
            loadingWhat="tracks"
            query={tracks}
            getKey={(track) => track.id}
            renderItem={(track) => <TrackRow track={track} />}
            empty={{
              title: 'No tracks yet',
              description: 'Tracks you upload show up here.',
              icon: <Illustration name="music" size="sm" />,
              actions: <Button label="Upload a track" variant="secondary" href="/upload" />,
            }}
          />
        </TrackListPlayback>
      </Section>
    </>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <Text type="label" size="sm" weight="semibold" color="secondary">
          {title.toUpperCase()}
        </Text>
        {action}
      </HStack>
      {children}
    </VStack>
  )
}

