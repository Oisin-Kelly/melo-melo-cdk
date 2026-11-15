import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sileo } from 'sileo'
import { api, isNotFound } from '@/lib/api-client'
import { startDownload } from '@/lib/download'
import { stageUpload } from '@/lib/dropbox'
import type { PaginatedResult, Recipient, ShareChange, ShareNote, UserSummary } from '@/types/api'

// The track screen. Keys live under ['tracks', 'detail', id] — never bare ['tracks', id],
// which would sit beside the library listings (['tracks', 'mine', …]).

// GET /tracks/{id} (api/Domain/Track.cs)
export type Track = {
  id: string
  name: string
  description: string | null
  genre: string | null
  imageUrl: string | null
  imageBgColor: string | null
  /** Epoch ms. */
  createdAt: number
  /** Seconds. */
  duration: number
  owner: UserSummary
  /** Readable-URL slug; null on items made before slugs existed (links fall back to the id). */
  slug?: string | null
  likedByMe: boolean
  /** Owner only: present exactly when you own the track. */
  likeCount?: number | null
  /** Owner only. */
  shareCount?: number | null
  /** Shared with you directly (not just through an album): when, and the caption. */
  myShare?: ShareNote
}

export const trackDetailKey = (id: string) => ['tracks', 'detail', id] as const
const recipientsKey = (id: string) => [...trackDetailKey(id), 'recipients'] as const
const likersKey = (id: string) => [...trackDetailKey(id), 'likers'] as const

/** 404 means deleted or not (any longer) shared with you — the API doesn't say which. */
export function useTrack(id: string) {
  return useQuery({
    queryKey: trackDetailKey(id),
    queryFn: () => api<Track>(`/tracks/${id}`),
    retry: (count, error) => !isNotFound(error) && count < 1,
  })
}

// Name and cover show on rows everywhere: refresh every list (not other details)
function refreshListsShowingTracks(queryClient: ReturnType<typeof useQueryClient>) {
  const notDetail = (query: { queryKey: readonly unknown[] }) => query.queryKey[1] !== 'detail'
  void queryClient.invalidateQueries({ queryKey: ['tracks'], predicate: notDetail })
  void queryClient.invalidateQueries({ queryKey: ['albums'] })
  void queryClient.invalidateQueries({ queryKey: ['playlists'] })
  void queryClient.invalidateQueries({ queryKey: ['feed'] })
  void queryClient.invalidateQueries({ queryKey: ['users'] })
}

// ---- owner: PUT /tracks/{id} — name required; genre and description are replaced
// (absent clears them); a new cover goes through the dropbox, or clearedImage removes it ----

export type TrackEdit = {
  name: string
  genre: string
  description: string
  cover: File | null
  clearCover: boolean
  /** Set only when the URL was changed (leaving it out keeps the current one). */
  slug?: string
}

export function useUpdateTrack(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, genre, description, cover, clearCover, slug }: TrackEdit) => {
      const imageKey = cover ? await stageUpload(cover, 'tracks') : undefined
      return api<Track>(`/tracks/${id}`, {
        method: 'PUT',
        body: {
          name: name.trim(),
          genre: genre.trim() || null,
          description: description.trim() || null,
          imageKey,
          clearedImage: !cover && clearCover,
          slug,
        },
      })
    },
    onSuccess: (track) => {
      // The response is the full owner view (counts included)
      queryClient.setQueryData(trackDetailKey(id), track)
      refreshListsShowingTracks(queryClient)
    },
  })
}

// ---- leaving: delete (owner) / remove from my library (recipient) ----
// The page's useConfirmLeave goes back and drops the detail cache once it has left.

function useLeavingMutation(request: () => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: request, onSuccess: () => refreshListsShowingTracks(queryClient) })
}

export const useDeleteTrack = (id: string) => useLeavingMutation(() => api(`/tracks/${id}`, { method: 'DELETE' }))

export const useRemoveTrackFromLibrary = (id: string) =>
  useLeavingMutation(() => api(`/tracks/shared/${id}`, { method: 'DELETE' }))

// ---- owner: GET /tracks/{id}/recipients (direct shares, no cursor) + POST /tracks/{id}/share ----

export function useTrackRecipients(id: string, enabled: boolean) {
  return useQuery({
    queryKey: recipientsKey(id),
    queryFn: () => api<{ items: Recipient[] }>(`/tracks/${id}/recipients`),
    select: (res) => res.items,
    enabled,
  })
}

export function useShareTrack(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ add, remove, caption }: ShareChange) =>
      api<{ sharedWith: string[] }>(`/tracks/${id}/share`, {
        method: 'POST',
        body: { add, remove, caption: caption?.trim() || null },
      }),
    // Recipients + the owner-only share count on the track itself
    onSettled: () => void queryClient.invalidateQueries({ queryKey: trackDetailKey(id) }),
  })
}

// ---- owner: GET /tracks/{id}/likes — who liked it, newest first ----

export type Liker = { user: UserSummary; likedAt: number }

export function useTrackLikers(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: likersKey(id),
    queryFn: ({ pageParam }) =>
      api<PaginatedResult<Liker>>(`/tracks/${id}/likes${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
  })
}

// ---- owner: GET /tracks/{id}/original — the original upload, in its uploaded format ----
// A short-lived presigned URL that S3 serves as an attachment named "{track name}.{ext}"; the
// browser saves it. 404: not your track, or one processed before originals were kept.

export type OriginalDownload = { url: string; fileName: string; contentType: string | null; expiresAt: number }

export const ORIGINAL_NOT_AVAILABLE = "The original file isn't available for this track"

export function useDownloadOriginal(id: string) {
  return useMutation({
    mutationFn: () => api<OriginalDownload>(`/tracks/${id}/original`),
    onSuccess: ({ url }) => startDownload(url),
    onError: (error) => {
      if (isNotFound(error)) sileo.error({ title: ORIGINAL_NOT_AVAILABLE })
      else sileo.error({ title: "Couldn't download the original", description: 'Please try again.' })
    },
  })
}
