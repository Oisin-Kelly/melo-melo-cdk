import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError, isNotFound } from './api-client'
import { albumPath, trackPath } from './links'
import type { UserSummary } from '@/types/api'

// Share links (api/Domain/ShareLink.cs): a link invites whoever holds it to add a track or album
// to their library — accepting makes them an ordinary recipient. Shared because both the invite
// screen (features/invites) and the owner's Share dialog (components/sharing) use it.
//
//   GET    /links/{token}           the invite preview — PUBLIC, works signed out
//   GET    /links/{token}/viewer    your relation to it (own / already have / none)
//   POST   /links/{token}/accept    add it to your library
//   POST   /links                   create (owner)          GET /links?kind=&targetId= (owner)
//   DELETE /links/{token}           revoke (owner)          POST /links/{token}/restore (owner)

export type LinkKind = 'TRACK' | 'ALBUM'

export type LinkPreviewAudio = { url: string; isFullTrack: boolean }

export type LinkPreviewTrack = {
  id: string
  name: string
  /** Seconds. */
  duration: number
  preview: LinkPreviewAudio
}

/** What the invite screen shows. Revoked, mistyped and deleted all read UNAVAILABLE, with no
 *  sender; an expired link still says who sent it. */
export type LinkPreview =
  | { state: 'UNAVAILABLE' }
  | { state: 'EXPIRED'; kind: LinkKind; sender: UserSummary; expiresAt: number }
  | {
      state: 'VALID'
      kind: LinkKind
      sender: UserSummary
      name: string
      imageUrl?: string
      imageBgColor?: string
      genre?: string
      /** Seconds: the track's length, or the album's total. */
      duration: number
      /** Epoch ms. */
      expiresAt: number
      /** The sender's note, if they wrote one. */
      caption?: string
      /** The track itself, or the album's tracklist in order. */
      tracks: LinkPreviewTrack[]
    }

export type LinkTarget = { kind: LinkKind; id: string; owner: string; slug?: string }

/** A link as its owner sees it. */
export type ShareLink = {
  token: string
  kind: LinkKind
  targetId: string
  /** Epoch ms. */
  createdAt: number
  /** Epoch ms. */
  expiresAt: number
  acceptedCount: number
  /** The sender's note: shown on the invite screen, and the share's caption once accepted. */
  caption?: string
  state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
}

export type LinkViewer = {
  relation: 'NONE' | 'OWN' | 'ALREADY_HAVE'
  target: LinkTarget
  /** The link's stats, for its owner only. */
  link?: ShareLink
}

export const EXPIRY_OPTIONS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
] as const
export type LinkExpiry = (typeof EXPIRY_OPTIONS)[number]['value']

/** Tracks this short or shorter play in full on the invite screen; longer ones get a clip. */
export const PREVIEW_CLIP_SECONDS = 30

export const shareLinkUrl = (token: string) => `${window.location.origin}${shareLinkPath(token)}`
export const shareLinkPath = (token: string) => `/s/${token}`

/** Where the item lives once you have it (its readable URL when it has one). */
export function linkTargetPath(target: LinkTarget): string {
  const item = { id: target.id, slug: target.slug, owner: { username: target.owner } }
  return target.kind === 'TRACK' ? trackPath(item) : albumPath(item)
}

// ---- the invite screen ----

const previewKey = (token: string) => ['links', 'preview', token] as const
const viewerKey = (token: string) => ['links', 'viewer', token] as const

export function useLinkPreview(token: string) {
  return useQuery({
    queryKey: previewKey(token),
    queryFn: () => api<LinkPreview>(`/links/${encodeURIComponent(token)}`),
    // Never kept between visits: the link may have expired or been revoked since. Preview URLs
    // last 10 minutes, so a page left open refetches before they run out.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 8 * 60_000,
  })
}

export function useLinkViewer(token: string, enabled: boolean) {
  return useQuery({
    queryKey: viewerKey(token),
    queryFn: () => api<LinkViewer>(`/links/${encodeURIComponent(token)}/viewer`),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: (count, error) => !isNotFound(error) && count < 1,
  })
}

/** Everything that lists or shows what's in your library: a track or album you just added (or
 *  removed again) changes all of them. Search's snapshots sit under the same prefixes. */
function refreshLibrary(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['tracks'] })
  void queryClient.invalidateQueries({ queryKey: ['albums'] })
  void queryClient.invalidateQueries({ queryKey: ['feed'] })
  void queryClient.invalidateQueries({ queryKey: ['users'] })
}

/** 410 = expired, 404 = revoked/removed: either way it stopped working while the page was open. */
export const isLinkGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 410)

export function useAcceptLink(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<LinkTarget>(`/links/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
    onSuccess: () => {
      clearPendingInvite()
      refreshLibrary(queryClient)
    },
  })
}

/** Undo right after adding: the recipient-side "remove from my library". */
export function useUndoAccept(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (target: LinkTarget) =>
      api(`/${target.kind === 'TRACK' ? 'tracks' : 'albums'}/shared/${target.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refreshLibrary(queryClient)
      void queryClient.invalidateQueries({ queryKey: viewerKey(token) })
    },
  })
}

// ---- the owner's Links section ----

const itemLinksKey = (kind: LinkKind, id: string) => ['links', 'item', kind, id] as const

export function useItemLinks(kind: LinkKind, id: string, enabled: boolean) {
  return useQuery({
    queryKey: itemLinksKey(kind, id),
    queryFn: () => api<{ items: ShareLink[] }>(`/links?kind=${kind}&targetId=${encodeURIComponent(id)}`),
    select: (res) => res.items,
    enabled,
  })
}

export function useCreateLink(kind: LinkKind, id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ expiresIn, caption }: { expiresIn: LinkExpiry; caption?: string }) =>
      api<ShareLink>('/links', {
        method: 'POST',
        body: { kind, targetId: id, expiresIn, caption: caption?.trim() || null },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: itemLinksKey(kind, id) }),
  })
}

function useLinkChange(kind: LinkKind, id: string, change: (token: string) => Promise<ShareLink>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: change,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: itemLinksKey(kind, id) }),
  })
}

export const useRevokeLink = (kind: LinkKind, id: string) =>
  useLinkChange(kind, id, (token) => api<ShareLink>(`/links/${encodeURIComponent(token)}`, { method: 'DELETE' }))

export const useRestoreLink = (kind: LinkKind, id: string) =>
  useLinkChange(kind, id, (token) =>
    api<ShareLink>(`/links/${encodeURIComponent(token)}/restore`, { method: 'POST' }),
  )

// ---- an invite opened while signed out ----
// Signing up takes several screens (sign up → verify code → sign in), and people often leave to
// find the code and come back in a new tab, losing ?next=. So the invite is also remembered
// here, and the auth screens fall back to it. Cleared once used, or when it turns out dead.

const PENDING_KEY = 'mm-pending-invite'
const PENDING_MAX_AGE = 24 * 60 * 60_000

export function savePendingInvite(token: string) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ token, savedAt: Date.now() }))
  } catch {
    // Private mode / blocked storage: ?next= still carries it within the tab
  }
}

/** The remembered invite's path, if one was opened in the last day. */
export function readPendingInvitePath(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { token?: string; savedAt?: number } | null
    if (!saved?.token || !saved.savedAt || Date.now() - saved.savedAt > PENDING_MAX_AGE) return null
    return shareLinkPath(saved.token)
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // nothing to clear
  }
}
