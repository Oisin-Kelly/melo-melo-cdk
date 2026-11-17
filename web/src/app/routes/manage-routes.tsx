import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { ManageAlbumsPage } from '@/features/albums/components/manage-albums-page'
import { ManagePlaylistsPage } from '@/features/playlists/components/manage-playlists-page'
import { ManageTracksPage } from '@/features/tracks/components/manage-tracks-page'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'

// /tracks, /albums, /playlists: the manage tables are for wider screens. On a phone your
// tracks and albums are on your profile, your playlists in Library.
function WiderScreensOnly({ phoneTo, children }: { phoneTo: string; children: ReactNode }) {
  const isMobile = useIsMobile()
  return isMobile ? <Navigate to={phoneTo} replace /> : children
}

export function TracksRoute() {
  return (
    <WiderScreensOnly phoneTo={profilePath(useUsername())}>
      <ManageTracksPage />
    </WiderScreensOnly>
  )
}

export function AlbumsRoute() {
  return (
    <WiderScreensOnly phoneTo={profilePath(useUsername())}>
      <ManageAlbumsPage />
    </WiderScreensOnly>
  )
}

export function PlaylistsRoute() {
  return (
    <WiderScreensOnly phoneTo="/library">
      <ManagePlaylistsPage />
    </WiderScreensOnly>
  )
}
