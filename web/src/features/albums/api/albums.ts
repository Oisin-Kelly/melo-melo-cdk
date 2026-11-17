import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Details } from '@/components/forms/edit-details-dialog'
import { api, isNotFound } from '@/lib/api-client'
import { forEachId } from '@/lib/bulk'
import { invalidateAppearsIn } from '@/lib/appears-in'
import { stageUpload } from '@/lib/dropbox'
import type { AlbumSummary, PaginatedResult, Recipient, ShareChange, ShareNote, TrackSummary, UserSummary } from '@/types/api'

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
      invalidateAppearsIn(queryClient)
    },
  })
}

// ---- owner: POST /albums (name, description, cover and its tracks in one go) and
// PUT /albums/{id}/tracks (the list becomes the tracklist, in that order) ----

export type NewAlbum = Pick<Details, 'name' | 'description' | 'cover'> & { trackIds: string[] }

export function useCreateAlbum() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, description, cover, trackIds }: NewAlbum) => {
      const imageKey = cover.file ? await stageUpload(cover.file, 'albums') : undefined
      return api<Album>('/albums', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() || null, imageKey, trackIds },
      })
    },
    onSuccess: () => {
      // Your albums on your profile, and search's snapshot of them
      void queryClient.invalidateQueries({ queryKey: ['albums'] })
      invalidateAppearsIn(queryClient)
    },
  })
}

export function useSetAlbumTracks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: string; trackIds: string[] }) =>
      api<{ trackCount: number; added: number; removed: number }>(`/albums/${id}/tracks`, {
        method: 'PUT',
        body: { trackIds },
      }),
    onSuccess: () => {
      // The page itself, the album's size on every tile and feed row, and what the people
      // it's shared with can find
      void queryClient.invalidateQueries({ queryKey: ['albums'] })
      void queryClient.invalidateQueries({ queryKey: ['feed'] })
      invalidateAppearsIn(queryClient)
    },
  })
}

// ---- leaving the page: owner deletes, recipient removes it from their library ----
// The page's useConfirmLeave goes back and drops the detail cache once it has left;
// these refresh everything that listed it.

function refreshAfterLeaving(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['feed'] })
  void queryClient.invalidateQueries({
    queryKey: ['albums'],
    predicate: (query) => query.queryKey[1] !== 'detail',
  })
  // Its tracks drop out of (or turn into placeholders in) playlists and likes
  void queryClient.invalidateQueries({ queryKey: ['playlists'] })
  invalidateAppearsIn(queryClient)
}

function useLeavingMutation(request: () => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: request, onSuccess: () => refreshAfterLeaving(queryClient) })
}

export const useDeleteAlbum = (id: string) =>
  useLeavingMutation(() => api(`/albums/${id}`, { method: 'DELETE' }))

export const useRemoveAlbumFromLibrary = (id: string) =>
  useLeavingMutation(() => api(`/albums/shared/${id}`, { method: 'DELETE' }))

// ---- the Your albums table (/albums): every album you've made, and bulk actions on them.
// No bulk endpoints: the single-album call per album (lib/bulk), lists refreshed once. ----

/** Every album you've made, newest first (GET /albums, 100 at a time). Under
 *  ['albums', 'mine', …], so creating, editing and deleting refresh it. */
export function useAllMyAlbums() {
  return useQuery({
    queryKey: ['albums', 'mine', 'every'],
    queryFn: async () => {
      const albums: AlbumSummary[] = []
      let cursor: string | null = null
      do {
        const qs: string = `?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const page = await api<PaginatedResult<AlbumSummary>>(`/albums${qs}`)
        albums.push(...page.items)
        cursor = page.nextCursor
      } while (cursor)
      return albums
    },
  })
}

/** One album with every page of its tracks, in order: what Edit tracks starts from. */
export async function fetchWholeAlbum(id: string): Promise<{ album: Album; tracks: TrackSummary[] }> {
  const tracks: TrackSummary[] = []
  let album: Album | undefined
  let cursor: string | null = null
  do {
    const qs: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const res = await api<{ album: Album; tracks: PaginatedResult<TrackSummary> }>(`/albums/${id}${qs}`)
    album ??= res.album
    tracks.push(...res.tracks.items)
    cursor = res.tracks.nextCursor
  } while (cursor)
  return { album: album!, tracks }
}

/** DELETE /albums/{id} for each. */
export function useDeleteAlbums() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => forEachId(ids, (id) => api(`/albums/${id}`, { method: 'DELETE' })),
    onSuccess: ({ done }) => {
      if (done.length > 0) refreshAfterLeaving(queryClient)
    },
  })
}

/** POST /albums/{id}/share for each: the same people and caption on every album. */
export function useShareAlbums() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, add, caption }: { ids: string[]; add: string[]; caption: string }) =>
      forEachId(ids, (id) =>
        api(`/albums/${id}/share`, { method: 'POST', body: { add, remove: [], caption: caption.trim() || null } }),
      ),
    // Recipients + the owner-only share count on each album's own page
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['albums', 'detail'] }),
  })
}
