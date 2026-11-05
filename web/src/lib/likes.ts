import { useMutation, useQueryClient, type Query, type QueryKey } from '@tanstack/react-query'
import { sileo } from 'sileo'
import { api } from '@/lib/api-client'
import { playlistDetailKey } from '@/lib/playlists'

// POST /tracks|albums/{id}/like — the one like mutation every heart uses.
//
// Optimistic everywhere at once: it flips `likedByMe` on the track/album wherever it
// sits in any cached paginated list (Home, Liked, album/playlist pages), so no screen
// patches its own copy. Lists whose *membership* depends on likes (the Liked lists)
// are only marked stale, never refetched while on screen: unliking on Liked keeps the
// row so a mis-tap can be undone in place, and it's gone on the next visit.

export type LikeTarget = { kind: 'TRACK' | 'ALBUM'; id: string; liked: boolean }

type Likeable = { id: string; likedByMe: boolean }

const isLikeable = (value: unknown): value is Likeable =>
  typeof value === 'object' && value !== null && 'id' in value && 'likedByMe' in value

const flip = (value: unknown, { id, liked }: LikeTarget) =>
  isLikeable(value) && value.id === id ? { ...value, likedByMe: liked } : value

// A row is the summary itself, or wraps one as `track` / `album` (feed entries,
// liked tracks, playlist entries). Ids are globally unique, so kind needn't be checked.
function patchRow(row: unknown, target: LikeTarget): unknown {
  const patched = flip(row, target)
  if (typeof patched !== 'object' || patched === null) return patched
  const wrapper = patched as { track?: unknown; album?: unknown }
  return {
    ...wrapper,
    ...('track' in wrapper && { track: flip(wrapper.track, target) }),
    ...('album' in wrapper && { album: flip(wrapper.album, target) }),
  }
}

type Pages = { pages: { items: unknown[]; album?: unknown }[] }

const isPages = (data: unknown): data is Pages =>
  typeof data === 'object' && data !== null && Array.isArray((data as Pages).pages)

function patchPages(data: Pages, target: LikeTarget): Pages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((row) => patchRow(row, target)),
      // the album page carries the album itself beside its tracks
      ...('album' in page && { album: flip(page.album, target) }),
    })),
  }
}

// Only lists that already hold data: cancelling a first-page fetch would strand it
const hasPages = (query: Query) => isPages(query.state.data)

export function useToggleLike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, id, liked }: LikeTarget) =>
      api<{ newValue: boolean }>(`/${kind === 'TRACK' ? 'tracks' : 'albums'}/${id}/like`, {
        method: 'POST',
        body: { newValue: liked },
      }),
    onMutate: async (target) => {
      await queryClient.cancelQueries({ predicate: hasPages })
      const snapshot = queryClient.getQueriesData({ predicate: hasPages })
      for (const [key, data] of snapshot) {
        if (isPages(data)) queryClient.setQueryData(key, patchPages(data, target))
      }
      // The track page holds a single track, not pages
      if (target.kind === 'TRACK') {
        const detailKey = ['tracks', 'detail', target.id]
        await queryClient.cancelQueries({ queryKey: detailKey, exact: true })
        const detail = queryClient.getQueryData(detailKey)
        if (detail) {
          snapshot.push([detailKey, detail])
          queryClient.setQueryData(detailKey, flip(detail, target))
        }
      }
      return { snapshot }
    },
    onError: (_error, target, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data))
      sileo.error({
        title: target.liked ? "Couldn't like that" : "Couldn't remove the like",
        description: 'Please try again.',
      })
    },
    onSettled: (_data, _error, target) => {
      // Album and track pages show their owner the like count (and who liked it), which
      // the flip above can't know
      if (target.kind === 'ALBUM') void queryClient.invalidateQueries({ queryKey: ['albums', 'detail', target.id] })
      if (target.kind === 'TRACK') void queryClient.invalidateQueries({ queryKey: ['tracks', 'detail', target.id] })
      // The likes playlist's totals (sidebar + search's playlist list)
      void queryClient.invalidateQueries({ queryKey: ['playlists'], exact: true })
      void queryClient.invalidateQueries({ queryKey: ['playlists', 'all'] })
      // Liked tracks (the likes playlist page) / Library's liked albums gain or lose a row:
      // refetch on next visit, not under the user
      const stale: QueryKey[] = [playlistDetailKey('likes'), ['albums', 'liked']]
      stale.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey, refetchType: 'none' }))
    },
  })
}
