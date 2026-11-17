import { createContext, useContext } from 'react'
import type { TrackSummary } from '@/types/api'

/** The album whose tracks are being edited, and how to get all of them in order. */
export type EditableAlbum = { id: string; name: string; shareCount?: number }

// Making an album, or editing one's tracks, from anywhere in the app (your profile,
// Library, the album page). AlbumEditorProvider (in AppLayout) holds the dialog; outside
// one, these do nothing.
export const AlbumEditorContext = createContext<{
  /** `tracks`: what the new album's tracklist starts with (e.g. a selection). */
  create: (tracks?: TrackSummary[]) => void
  editTracks: (album: EditableAlbum, loadTracks: () => Promise<TrackSummary[]>) => void
}>({ create: () => {}, editTracks: () => {} })

export const useAlbumEditor = () => useContext(AlbumEditorContext)
