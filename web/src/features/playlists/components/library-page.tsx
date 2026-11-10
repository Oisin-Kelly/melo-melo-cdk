import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import { AlbumShelf } from '@/components/media/album-tile'
import { CoverArt } from '@/components/media/cover-art'
import { CoverPlay } from '@/components/media/cover-play'
import { LikedCover } from '@/components/media/liked-cover'
import { loadPlaylist } from '@/components/player/load-context'
import { useUsername } from '@/lib/auth/auth-context'
import { playlistPath } from '@/lib/links'
import { usePlaylists } from '@/lib/playlists'
import { useLikedAlbums } from '../api/playlists'
import { CreatePlaylistDialog } from './create-playlist-dialog'

const tracks = (count: number) => `${count} ${count === 1 ? 'track' : 'tracks'}`

// A first, simple Library: Liked tracks (the likes playlist) and your playlists, then a
// shelf of the albums you've liked — on phones it's the only way to reach them (there's
// no side nav). The full Library (your tracks, albums, things
// shared with you) gets its own plan, and may move this into its own feature.
export function LibraryPage() {
  const me = useUsername()
  const playlists = usePlaylists()
  const likedAlbums = useLikedAlbums()
  const [isCreating, setIsCreating] = useState(false)
  const likes = playlists.data?.find((playlist) => playlist.type === 'LIKES')
  const custom = playlists.data?.filter((playlist) => playlist.type === 'CUSTOM') ?? []

  return (
    <VStack gap={4}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Heading level={1}>Library</Heading>
        </StackItem>
        <Button
          label="New playlist"
          variant="secondary"
          size="sm"
          icon={<Icon icon={PlusIcon} />}
          onClick={() => setIsCreating(true)}
        />
      </HStack>

      <List hasDividers={false} edgeCompensation="inline">
        <ListItem
          href="/liked"
          className="mm-play-hover"
          startContent={
            <CoverPlay
              context={{ type: 'PLAYLIST', id: 'likes' }}
              load={() => loadPlaylist('likes', me)}
              name="Liked tracks"
              isEmpty={likes?.trackCount === 0}
            >
              <LikedCover size="sm" />
            </CoverPlay>
          }
          label="Liked tracks"
          description={likes ? `Playlist · ${tracks(likes.trackCount)}` : 'Tracks you liked'}
        />
        {custom.map((playlist) => (
          <ListItem
            key={playlist.id}
            href={playlistPath(playlist, me)}
            className="mm-play-hover"
            startContent={
              <CoverPlay
                context={{ type: 'PLAYLIST', id: playlist.id }}
                load={() => loadPlaylist(playlist.id, me)}
                name={playlist.name}
                isEmpty={playlist.trackCount === 0}
              >
                <CoverArt imageUrl={playlist.imageUrl} imageBgColor={playlist.imageBgColor} size="sm" />
              </CoverPlay>
            }
            label={playlist.name}
            description={`Playlist · ${tracks(playlist.trackCount)}`}
          />
        ))}
      </List>

      {playlists.isPending && (
        <PageLoader compact what="playlists" />
      )}
      {playlists.isError && (
        <Text type="supporting" color="secondary">
          Couldn't load your playlists.
        </Text>
      )}
      {playlists.isSuccess && custom.length === 0 && (
        <Text type="supporting" color="secondary">
          No playlists yet. Make one to collect tracks you like together.
        </Text>
      )}

      <AlbumShelf title="Liked albums" query={likedAlbums} toAlbum={(album) => album} />

      <CreatePlaylistDialog isOpen={isCreating} onOpenChange={setIsCreating} />
    </VStack>
  )
}
