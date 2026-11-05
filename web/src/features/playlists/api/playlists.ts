import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sileo } from 'sileo'
import type { Details } from '@/components/forms/edit-details-dialog'
import { api, isNotFound } from '@/lib/api-client'
import { stageUpload } from '@/lib/dropbox'
import { playlistDetailKey, playlistsQueryKey, type Playlist, type PlaylistTrackEntry } from '@/lib/playlists'
import type { AlbumSummary, PaginatedResult } from '@/types/api'

// The list itself (usePlaylists) and add-to-playlist live in lib/playlists, since
// other features need them; this is the playlist and Library screens' own data.

export function useCreatePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api<Playlist>('/playlists', { method: 'POST', body: { name: name.trim() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: playlistsQueryKey }),
  })
}

// ---- GET /playlists/{id} → {playlist, tracks: Page(PlaylistTrackEntry)} ----

/** Each page carries the playlist too; the header reads the first page's. */
export type PlaylistPage = PaginatedResult<PlaylistTrackEntry> & { playlist: Playlist }

// 100 a page: searching or sorting loads the whole playlist, so big pages mean few requests
export function usePlaylistDetail(id: string) {
  return useInfiniteQuery({
    queryKey: playlistDetailKey(id),
    queryFn: async ({ pageParam }): Promise<PlaylistPage> => {
      const qs = `?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`
      const res = await api<{ playlist: Playlist; tracks: PaginatedResult<PlaylistTrackEntry> }>(
        `/playlists/${id}${qs}`,
      )
      return { playlist: res.playlist, ...res.tracks }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: (count, error) => !isNotFound(error) && count < 1,
  })
}

// The sidebar list and search's copy both show names/covers/totals
function invalidateLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: playlistsQueryKey, exact: true })
  void queryClient.invalidateQueries({ queryKey: ['playlists', 'all'] })
}

// ---- DELETE /playlists/{id}/tracks/{trackId}: optimistic, works on placeholders too ----

export function useRemoveFromPlaylist(id: string) {
  const queryClient = useQueryClient()
  const key = playlistDetailKey(id)
  return useMutation({
    mutationFn: (trackId: string) =>
      api<{ trackId: string; removed: boolean }>(`/playlists/${id}/tracks/${trackId}`, { method: 'DELETE' }),
    onMutate: async (trackId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = queryClient.getQueryData(key)
      queryClient.setQueryData<{ pages: PlaylistPage[]; pageParams: unknown[] }>(key, (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((entry) => entry.trackId !== trackId),
          })),
        },
      )
      return { snapshot }
    },
    onError: (_error, _trackId, context) => {
      queryClient.setQueryData(key, context?.snapshot)
      sileo.error({ title: "Couldn't remove that track", description: 'Please try again.' })
    },
    onSettled: () => {
      // Refreshes the header's count and length
      void queryClient.invalidateQueries({ queryKey: key })
      invalidateLists(queryClient)
    },
  })
}

// ---- PUT /playlists/{id}: name + description (full replace; the cover is untouched) ----

export function useUpdatePlaylist(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    // A new cover goes through the dropbox; clearedImage removes the current one
    mutationFn: async ({ name, description, cover, slug }: Details) => {
      const imageKey = cover.file ? await stageUpload(cover.file, 'playlists') : undefined
      return api<Playlist>(`/playlists/${id}`, {
        method: 'PUT',
        body: {
          name: name.trim(),
          description: description.trim() || null,
          imageKey,
          clearedImage: !cover.file && cover.clear,
          slug,
        },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playlistDetailKey(id) })
      invalidateLists(queryClient)
    },
  })
}

// ---- DELETE /playlists/{id} ----
// The page's useConfirmLeave goes back and drops the detail cache once it has left.

export function useDeletePlaylist(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ message: string }>(`/playlists/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateLists(queryClient),
  })
}

// ---- GET /albums/liked → Page(AlbumSummary), most recently liked first ----
// Library's Liked albums shelf. Under ['albums', 'liked'], which the shared like mutation
// (lib/likes) marks stale; never the search snapshot key (…, 'all'), a different shape.

export function useLikedAlbums() {
  return useInfiniteQuery({
    queryKey: ['albums', 'liked', 'list'],
    queryFn: ({ pageParam }) =>
      api<PaginatedResult<AlbumSummary>>(
        `/albums/liked?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  })
}
