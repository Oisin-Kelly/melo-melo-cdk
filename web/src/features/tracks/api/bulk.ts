import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { forEachId, type BulkResult } from '@/lib/bulk'
import { invalidateAppearsIn } from '@/lib/appears-in'
import { playlistDetailKey, playlistsQueryKey, type Playlist } from '@/lib/playlists'
import { refreshListsShowingTracks } from './tracks'

// Bulk actions on the Your tracks table: the single-track call per track (lib/bulk), with
// lists refreshed once at the end.

/** DELETE /tracks/{id} for each. */
export function useDeleteTracks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => forEachId(ids, (id) => api(`/tracks/${id}`, { method: 'DELETE' })),
    onSuccess: ({ done }) => {
      if (done.length > 0) refreshListsShowingTracks(queryClient)
    },
  })
}

/** POST /playlists/{id}/tracks/{trackId} for each, in the order given (a track already in
 *  the playlist is a no-op server-side, and counts as done). One at a time: each add takes
 *  the next rank after the playlist's last, so parallel adds could land on the same one. */
export function useAddTracksToPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ playlist, ids }: { playlist: Playlist; ids: string[] }) => {
      const result: BulkResult = { done: [], failed: [] }
      for (const id of ids) {
        try {
          await api(`/playlists/${playlist.id}/tracks/${id}`, { method: 'POST' })
          result.done.push(id)
        } catch {
          result.failed.push(id)
        }
      }
      return result
    },
    onSuccess: (_result, { playlist }) => {
      void queryClient.invalidateQueries({ queryKey: playlistsQueryKey, exact: true })
      void queryClient.invalidateQueries({ queryKey: playlistDetailKey(playlist.id) })
      invalidateAppearsIn(queryClient)
    },
  })
}

/** POST /tracks/{id}/share for each: the same people and caption on every track. */
export function useShareTracks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, add, caption }: { ids: string[]; add: string[]; caption: string }) =>
      forEachId(ids, (id) =>
        api(`/tracks/${id}/share`, { method: 'POST', body: { add, remove: [], caption: caption.trim() || null } }),
      ),
    // Recipients + the owner-only share count on each track's own page
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tracks', 'detail'] }),
  })
}
