import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sileo } from 'sileo'
import { api } from '@/lib/api-client'
import { invalidateAppearsIn } from '@/lib/appears-in'
import type { PaginatedResult, TrackSummary } from '@/types/api'

// The user's playlists, shared because several features need them: the sidebar lists
// them, every track row's menu adds to them, and the playlist page edits one.

// GET /playlists (api/Domain/Playlist.cs). Always private to their owner.
export type Playlist = {
  id: string
  name: string
  description: string | null
  type: 'LIKES' | 'CUSTOM'
  /** Readable-URL slug; null on the likes playlist (/liked) and on pre-slug playlists. */
  slug?: string | null
  imageUrl: string | null
  imageBgColor: string | null
  trackCount: number
  totalDurationSeconds: number
  /** Epoch ms. */
  createdAt: number
}

/** One row of GET /playlists/{id}'s tracks. Unavailable rows have no `track`. */
export type PlaylistTrackEntry = {
  trackId: string
  /** Denormalized, so a placeholder can still show what it was. */
  name: string
  duration: number
  /** Epoch ms (for the likes playlist: when it was liked). */
  addedAt: number
  unavailable: boolean
  /** DELETED: the track is gone. REVOKED: it's no longer shared with you. */
  reason?: 'DELETED' | 'REVOKED'
  track?: TrackSummary
}

export const playlistsQueryKey = ['playlists'] as const
export const playlistDetailKey = (id: string) => ['playlists', 'detail', id] as const

// Newest first, the likes playlist always on top. One page of 100 covers the sidebar
// for anyone short of a hundred playlists; the Library screen will page properly.
export function usePlaylists() {
  return useQuery({
    queryKey: playlistsQueryKey,
    queryFn: () => api<PaginatedResult<Playlist>>('/playlists?limit=100'),
    select: (page) => page.items,
  })
}

// POST /playlists/{id}/tracks/{trackId}. Re-adding a member is a no-op server-side
// (keeps its position), so that's "Already in", not an error.
export function useAddToPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ playlist, trackId }: { playlist: Playlist; trackId: string }) =>
      api<{ trackId: string; added: boolean }>(`/playlists/${playlist.id}/tracks/${trackId}`, { method: 'POST' }),
    onSuccess: ({ added }, { playlist }) => {
      if (added) sileo.success({ title: 'Added to playlist', description: playlist.name })
      else sileo.info({ title: `Already in ${playlist.name}` })
    },
    onError: () => sileo.error({ title: "Couldn't add to the playlist", description: 'Please try again.' }),
    onSettled: (_data, _error, { playlist }) => {
      void queryClient.invalidateQueries({ queryKey: playlistsQueryKey, exact: true })
      void queryClient.invalidateQueries({ queryKey: playlistDetailKey(playlist.id) })
      invalidateAppearsIn(queryClient)
    },
  })
}
