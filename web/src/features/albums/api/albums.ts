import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Details } from '@/components/forms/edit-details-dialog'
import { api, isNotFound } from '@/lib/api-client'
import { stageUpload } from '@/lib/dropbox'
import type { PaginatedResult, Recipient, ShareChange, ShareNote, TrackSummary, UserSummary } from '@/types/api'

// The album screen. Keys live under ['albums', 'detail', id] — never bare
// ['albums', id], which would sit beside search's ['albums', …, 'all'] snapshots.

// GET /albums/{id}'s album (api/Domain/Album.cs)
export type Album = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  imageBgColor: string | null
  trackCount: number
  totalDurationSeconds: number
  /** Owner only: present exactly when you own the album. */
  shareCount?: number
  /** Owner only. */
  likeCount?: number
  likedByMe: boolean
  /** Epoch ms. */
  createdAt: number
  owner?: UserSummary
  /** Readable-URL slug; null on items made before slugs existed (links fall back to the id). */
  slug?: string | null
  /** Shared with you: when, and the caption. */
  myShare?: ShareNote
}

export const albumDetailKey = (id: string) => ['albums', 'detail', id] as const
const recipientsKey = (id: string) => [...albumDetailKey(id), 'recipients'] as const

/** Every page carries the album; the header reads the first page's. */
export type AlbumPage = PaginatedResult<TrackSummary> & { album: Album }

export function useAlbumDetail(id: string) {
  return useInfiniteQuery({
    queryKey: albumDetailKey(id),
    queryFn: async ({ pageParam }): Promise<AlbumPage> => {
      const qs = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''
      const res = await api<{ album: Album; tracks: PaginatedResult<TrackSummary> }>(`/albums/${id}${qs}`)
      return { album: res.album, ...res.tracks }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: (count, error) => !isNotFound(error) && count < 1,
  })
}

// ---- owner: GET /albums/{id}/recipients (≤50, no cursor) + POST /albums/{id}/share ----

export function useAlbumRecipients(id: string, enabled: boolean) {
  return useQuery({
    queryKey: recipientsKey(id),
    queryFn: () => api<{ items: Recipient[] }>(`/albums/${id}/recipients`),
    select: (res) => res.items,
    enabled,
  })
}

export function useShareAlbum(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ add, remove, caption }: ShareChange) =>
      api<{ sharedWith: string[] }>(`/albums/${id}/share`, {
        method: 'POST',
        body: { add, remove, caption: caption?.trim() || null },
      }),
    // Recipients + the owner-only share count on the album itself
    onSettled: () => void queryClient.invalidateQueries({ queryKey: albumDetailKey(id) }),
  })
}

// ---- owner: PUT /albums/{id} (name + description, full replace; a new cover via the
// dropbox, or clearedImage removes it) ----

export function useUpdateAlbum(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, description, cover, slug }: Details) => {
      const imageKey = cover.file ? await stageUpload(cover.file, 'albums') : undefined
      return api<Album>(`/albums/${id}`, {
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
      // The name and cover show in every album list, search, and recipients' feeds
      void queryClient.invalidateQueries({ queryKey: ['albums'] })
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })
}

// ---- leaving the page: owner deletes, recipient removes it from their library ----
// The page's useConfirmLeave goes back and drops the detail cache once it has left;
// these refresh everything that listed it.

function useLeavingMutation(request: () => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      void queryClient.invalidateQueries({
        queryKey: ['albums'],
        predicate: (query) => query.queryKey[1] !== 'detail',
      })
      // Its tracks drop out of (or turn into placeholders in) playlists and likes
      void queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export const useDeleteAlbum = (id: string) =>
  useLeavingMutation(() => api(`/albums/${id}`, { method: 'DELETE' }))

export const useRemoveAlbumFromLibrary = (id: string) =>
  useLeavingMutation(() => api(`/albums/shared/${id}`, { method: 'DELETE' }))
