import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { stageUpload } from '@/lib/dropbox'

// Uploading a track (the /upload page). The audio is already staged (lib/dropbox
// stageUploadWithProgress) by the time this runs; one POST carries everything else, then
// the server processes it while the page polls its status.

export type NewTrack = {
  audioKey: string
  name: string
  genre: string
  description: string
  cover: File | null
  /** Usernames */
  sharedWith: string[]
  caption: string
}

/** POST /tracks/upload → 202 {trackId}. The cover, if any, is staged first. */
export function useUploadTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    // It's processing now: Your tracks shows it
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: pendingUploadsKey }),
    mutationFn: async (track: NewTrack) => {
      const imageKey = track.cover ? await stageUpload(track.cover, 'covers') : undefined
      return api<{ trackId: string; status: string }>('/tracks/upload', {
        method: 'POST',
        body: {
          name: track.name.trim(),
          audioKey: track.audioKey,
          genre: track.genre.trim() || null,
          description: track.description.trim() || null,
          imageKey,
          sharedWith: track.sharedWith,
          caption: track.sharedWith.length > 0 ? track.caption.trim() || null : null,
        },
      })
    },
  })
}

export type UploadState = 'PROCESSING' | 'COMPLETE' | 'FAILED'
type UploadStatus = { trackId: string; status: UploadState; name?: string; error?: string | null; createdAt: number }

/** An upload that hasn't become a track: still processing, or failed (with why). */
export type PendingUpload = UploadStatus & { status: 'PROCESSING' | 'FAILED'; name: string }

/** A PROCESSING that never moves means the processor died before it could say so (the
 *  server's UploadStatusRepository.StaleAfter, which reports it as FAILED itself) */
export const STALE_AFTER_MS = 20 * 60 * 1000

// Under ['tracks', …], so a finished upload's refresh (below) reloads it too
const pendingUploadsKey = ['tracks', 'uploads'] as const

/** GET /tracks/uploads: your uploads still processing or failed, newest first — rows at the
 *  top of Your tracks. Checks again every 5s while one is processing; when one stops
 *  processing (here or in another tab) your track lists are reloaded, since it's a track now. */
export function usePendingUploads() {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: pendingUploadsKey,
    queryFn: async () => {
      const before = queryClient.getQueryData<PendingUpload[]>(pendingUploadsKey) ?? []
      const { items } = await api<{ items: PendingUpload[] }>('/tracks/uploads')
      const stillProcessing = new Set(items.filter((u) => u.status === 'PROCESSING').map((u) => u.trackId))
      if (before.some((u) => u.status === 'PROCESSING' && !stillProcessing.has(u.trackId)))
        void queryClient.invalidateQueries({ queryKey: ['tracks', 'mine'] })
      return items
    },
    refetchInterval: (query) => (query.state.data?.some((u) => u.status === 'PROCESSING') ? 5000 : false),
  })
}

/** DELETE /tracks/uploads/{trackId}: clears a failed upload's row (gone at once). */
export function useDismissUpload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (trackId: string) => api(`/tracks/uploads/${trackId}`, { method: 'DELETE' }),
    onMutate: async (trackId) => {
      await queryClient.cancelQueries({ queryKey: pendingUploadsKey })
      const before = queryClient.getQueryData<PendingUpload[]>(pendingUploadsKey)
      queryClient.setQueryData<PendingUpload[]>(pendingUploadsKey, (uploads) =>
        uploads?.filter((u) => u.trackId !== trackId),
      )
      return { before }
    },
    onError: (_err, _id, context) => queryClient.setQueryData(pendingUploadsKey, context?.before),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: pendingUploadsKey }),
  })
}

/** GET /tracks/uploads/{trackId}, every 2s until it's done; a stuck PROCESSING (past
 *  STALE_AFTER_MS) reads as FAILED. Finishing refreshes your track lists. */
export function useUploadStatus(trackId: string | null, startedAt: number) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['tracks', 'upload', trackId],
    enabled: trackId !== null,
    queryFn: async (): Promise<UploadStatus> => {
      const status = await api<UploadStatus>(`/tracks/uploads/${trackId}`)
      if (status.status === 'PROCESSING' && Date.now() - startedAt > STALE_AFTER_MS)
        return { ...status, status: 'FAILED', error: 'Processing took too long. Please try again.' }
      if (status.status === 'COMPLETE') {
        void queryClient.invalidateQueries({ queryKey: ['tracks'], predicate: (q) => q.queryKey[1] !== 'upload' })
        void queryClient.invalidateQueries({ queryKey: ['playlists'] })
      }
      return status
    },
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'PROCESSING' ? false : 2000),
    staleTime: 0,
  })
}
