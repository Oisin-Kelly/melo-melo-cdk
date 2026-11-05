import { Skeleton } from '@astryxdesign/core/Skeleton'
import { SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useMemo, useState, type SVGProps } from 'react'
import { useLocation } from 'react-router'
import { useUsername } from '@/lib/auth/auth-context'
import { playlistPath } from '@/lib/links'
import { usePlaylists, type Playlist } from '@/lib/playlists'
import { CreatePlaylistDialog } from './create-playlist-dialog'

// A tiny cover for the nav row, as an SVG so it fits SideNavItem's icon slot: the
// cover image when there is one, else a rounded square in the playlist's colour.
function coverIcon(playlist: Playlist) {
  return function PlaylistCover(props: SVGProps<SVGSVGElement>) {
    const clipId = `mm-cover-${playlist.id}`
    return (
      <svg viewBox="0 0 20 20" {...props} aria-hidden="true">
        <clipPath id={clipId}>
          <rect width="20" height="20" rx="5" />
        </clipPath>
        <rect
          width="20"
          height="20"
          rx="5"
          // style, not the fill attribute: attributes don't resolve CSS variables
          style={{ fill: playlist.imageBgColor ?? 'var(--color-data-categorical-indigo)' }}
        />
        {playlist.imageUrl && (
          <image
            href={playlist.imageUrl}
            width="20"
            height="20"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}
      </svg>
    )
  }
}

// "Playlists" in the left nav: your custom playlists (the likes playlist lives under
// "Liked"), then a New playlist row.
export function SidebarPlaylists() {
  const { pathname } = useLocation()
  const me = useUsername()
  const playlists = usePlaylists()
  const [isCreating, setIsCreating] = useState(false)

  // Icon components are built once per data change (a new component type each render
  // would remount every cover)
  const custom = useMemo(
    () =>
      (playlists.data ?? [])
        .filter((playlist) => playlist.type === 'CUSTOM')
        .map((playlist) => ({ playlist, icon: coverIcon(playlist) })),
    [playlists.data],
  )

  return (
    <SideNavSection title="Playlists">
      {playlists.isPending && (
        <VStack gap={2} paddingInline={2} paddingBlock={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={20} width={`${70 - i * 12}%`} index={i} />
          ))}
        </VStack>
      )}

      {playlists.isSuccess && custom.length === 0 && (
        <VStack paddingInline={2} paddingBlock={1}>
          <Text type="supporting" color="secondary">
            No playlists yet
          </Text>
        </VStack>
      )}

      {custom.map(({ playlist, icon }) => (
        <SideNavItem
          key={playlist.id}
          label={playlist.name}
          href={playlistPath(playlist, me)}
          icon={icon}
          isSelected={pathname === playlistPath(playlist, me)}
        />
      ))}

      <SideNavItem label="New playlist" icon={PlusIcon} onClick={() => setIsCreating(true)} />
      <CreatePlaylistDialog isOpen={isCreating} onOpenChange={setIsCreating} />
    </SideNavSection>
  )
}
