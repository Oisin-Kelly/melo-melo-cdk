import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { sileo } from 'sileo'
import { AlbumEditorContext, type EditableAlbum } from '@/components/albums/album-editor-context'
import { PageLoader } from '@/components/feedback/page-loader'
import { DetailsFields } from '@/components/forms/details-fields'
import { TrackComposer } from '@/components/forms/track-composer'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { FormSheet } from '@/components/forms/form-sheet'
import { useDetailsDraft } from '@/components/forms/use-details-draft'
import { Illustration } from '@/components/illustrations/illustration'
import { ApiError } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { albumPath } from '@/lib/links'
import { formatLength } from '@/utils/format'
import type { TrackSummary } from '@/types/api'
import { useCreateAlbum, useSetAlbumTracks } from '../api/albums'
import { TrackPicker, Tracklist } from './tracklist-editor'
import { useTracklistDraft, type TracklistDraft } from './use-tracklist-draft'

// Making an album and editing an album's tracks: one dialog over whatever page you're on
// (a tall bottom sheet on phones), opened through AlbumEditorProvider. An album is made of
// tracks you've already uploaded — New album is its details beside its tracklist, Edit
// tracks the tracklist alone. Rows are dragged into order by their handles; "Add tracks"
// swaps the dialog's body for a picker over your uploads. Nothing is sent until the one
// Create / Save, and closing with unsaved work asks first.

type Target =
  | { mode: 'create'; tracks: TrackSummary[] }
  | { mode: 'edit'; album: EditableAlbum; loadTracks: () => Promise<TrackSummary[]> }

export function AlbumEditorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const value = useMemo(
    () => ({
      create: (tracks: TrackSummary[] = []) => setTarget({ mode: 'create', tracks }),
      editTracks: (album: EditableAlbum, loadTracks: () => Promise<TrackSummary[]>) =>
        setTarget({ mode: 'edit', album, loadTracks }),
    }),
    [],
  )
  const close = () => {
    setIsConfirmingDiscard(false)
    setIsDirty(false)
    setTarget(null)
  }
  // Cancel, Escape and a swipe down all ask first when there are unsaved changes
  const requestClose = () => (isDirty ? setIsConfirmingDiscard(true) : close())
  const isCreating = target?.mode === 'create'

  return (
    <AlbumEditorContext value={value}>
      {children}
      <FormSheet
        isOpen={target !== null}
        onOpenChange={(open) => !open && requestClose()}
        label={isCreating ? 'New album' : 'Edit tracks'}
        width={isCreating ? 1040 : 640}
      >
        {/* Mounted only while open, so each one starts fresh */}
        {target?.mode === 'create' && (
          <CreateForm initialTracks={target.tracks} close={close} requestClose={requestClose} onDirtyChange={setIsDirty} />
        )}
        {target?.mode === 'edit' && (
          <EditTracks target={target} close={close} requestClose={requestClose} onDirtyChange={setIsDirty} />
        )}
        <AlertDialog
          isOpen={isConfirmingDiscard}
          onOpenChange={setIsConfirmingDiscard}
          title={isCreating ? 'Discard this album?' : 'Discard changes?'}
          description={
            isCreating ? "The album won't be created." : "Your changes to this album's tracks won't be saved."
          }
          cancelLabel="Keep editing"
          actionLabel="Discard"
          actionVariant="destructive"
          onAction={close}
        />
      </FormSheet>
    </AlbumEditorContext>
  )
}

type FormProps = { close: () => void; requestClose: () => void; onDirtyChange: (isDirty: boolean) => void }

const EMPTY_DETAILS = { name: '', description: '' }
const NO_COVER = { imageUrl: null, imageBgColor: null }

/** A failed save, said in the dialog (a toast would sit behind it): the API's own words
 *  for a 400, else `fallback`. */
const saveError = (err: unknown, fallback: string) => (err instanceof ApiError && err.status === 400 ? err.message : fallback)

// The dialog's frame for both forms: while the picker is open its body and buttons take
// over; the form stays mounted (hidden) underneath so a picked cover keeps its preview.
function EditorLayout({
  title,
  tracklist,
  requestClose,
  action,
  error,
  children,
}: {
  title: string
  tracklist: TracklistDraft
  requestClose: () => void
  /** The form's own main button (Create album / Save). */
  action: ReactNode
  error: string | null
  children: ReactNode
}) {
  const isPicking = tracklist.picked !== null
  return (
    <DialogLayout
      // No ✕: Cancel closes it (as do Escape and a swipe), asking first with unsaved work
      header={<DialogHeader title={isPicking ? 'Add tracks' : title} />}
      footer={
        <HStack gap={2} hAlign="end">
          {isPicking ? (
            <>
              <Button label="Back" variant="secondary" onClick={tracklist.cancelPicking} />
              <Button label="Done" variant="primary" onClick={tracklist.donePicking} />
            </>
          ) : (
            <>
              <Button label="Cancel" variant="secondary" onClick={requestClose} />
              {action}
            </>
          )}
        </HStack>
      }
    >
      {/* Both views share one height (album-editor.css), so the dialog never resizes */}
      {isPicking && (
        <div className="mm-editor-body">
          <TrackPicker draft={tracklist} />
        </div>
      )}
      <div className="mm-editor-body" hidden={isPicking}>
        {error && <Banner status="error" title={error} />}
        {children}
      </div>
    </DialogLayout>
  )
}

function CreateForm({
  initialTracks,
  close,
  requestClose,
  onDirtyChange,
}: FormProps & { initialTracks: TrackSummary[] }) {
  const navigate = useNavigate()
  const me = useUsername()
  const create = useCreateAlbum()
  const typed = useDetailsDraft(EMPTY_DETAILS)
  // "Give it a name." only once a name has been typed and cleared — not on a form just opened
  const [hasNamed, setHasNamed] = useState(false)
  if (typed.name && !hasNamed) setHasNamed(true)
  const draft = hasNamed ? typed : { ...typed, errors: { ...typed.errors, name: null } }
  const tracklist = useTracklistDraft(initialTracks)
  const seconds = tracklist.tracks.reduce((total, track) => total + track.duration, 0)
  const [formError, setFormError] = useState<string | null>(null)
  // Tracks it was opened with count as work too: closing asks before dropping them
  const isDirty = draft.isDirty || tracklist.isDirty || initialTracks.length > 0
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const save = async () => {
    if (!draft.canSave || create.isPending) return
    setFormError(null)
    try {
      const { name, description, cover } = draft.toDetails()
      const album = await create.mutateAsync({ name, description, cover, trackIds: tracklist.tracks.map((t) => t.id) })
      close()
      // After it has closed: a toast behind an open dialog couldn't be seen
      sileo.success({ title: 'Album created', description: album.name })
      void navigate(albumPath({ id: album.id, slug: album.slug, owner: { username: me } }))
    } catch (err) {
      setFormError(saveError(err, "Couldn't create the album. Please try again."))
    }
  }

  return (
    <EditorLayout
      title="New album"
      tracklist={tracklist}
      requestClose={requestClose}
      error={formError}
      action={
        <Button
          label="Create album"
          variant="primary"
          isDisabled={!draft.canSave}
          isLoading={create.isPending}
          onClick={() => void save()}
        />
      }
    >
      {/* The album as it'll look (cover to add, its name as you type it, its size) beside
          its details and tracks — the composer Upload and Edit track use */}
      <div className="mm-album-editor">
        <TrackComposer
          draft={draft}
          currentCover={NO_COVER}
          onCoverError={setFormError}
          meta={
            <Text type="supporting" color="secondary">
              Album · {tracklist.tracks.length} {tracklist.tracks.length === 1 ? 'track' : 'tracks'}
              {seconds > 0 && ` · ${formatLength(seconds)}`}
            </Text>
          }
        >
          <VStack gap={6}>
            <DetailsFields
              draft={draft}
              hasCover={false}
              currentCover={NO_COVER}
              onCoverError={setFormError}
              descriptionRows={2}
              hasAutoFocus
            />
            <Tracklist draft={tracklist} />
          </VStack>
        </TrackComposer>
      </div>
    </EditorLayout>
  )
}

// Edit tracks starts from the whole album, every page of it, in its order
function EditTracks({ target, ...form }: FormProps & { target: Extract<Target, { mode: 'edit' }> }) {
  const [tracks, setTracks] = useState<TrackSummary[] | 'failed' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let isCurrent = true
    target.loadTracks().then(
      (loaded) => isCurrent && setTracks(loaded),
      () => isCurrent && setTracks('failed'),
    )
    return () => {
      isCurrent = false
    }
  }, [target, attempt])

  if (Array.isArray(tracks)) return <EditTracksForm album={target.album} initial={tracks} {...form} />
  return (
    <DialogLayout
      header={<DialogHeader title="Edit tracks" />}
      footer={
        <HStack gap={2} hAlign="end">
          <Button label="Cancel" variant="secondary" onClick={form.close} />
        </HStack>
      }
    >
      {tracks === 'failed' ? (
        <EmptyState
          isCompact
          icon={<Illustration name="lost" size="sm" />}
          title="Couldn't load the album's tracks"
          description="Check your connection and try again."
          actions={
            <Button
              label="Try again"
              onClick={() => {
                setTracks(null)
                setAttempt((n) => n + 1)
              }}
            />
          }
        />
      ) : (
        <PageLoader compact what="album" />
      )}
    </DialogLayout>
  )
}

function EditTracksForm({
  album,
  initial,
  close,
  requestClose,
  onDirtyChange,
}: FormProps & { album: EditableAlbum; initial: TrackSummary[] }) {
  const setTracks = useSetAlbumTracks()
  const tracklist = useTracklistDraft(initial)
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => {
    onDirtyChange(tracklist.isDirty)
  }, [tracklist.isDirty, onDirtyChange])

  const save = async () => {
    setFormError(null)
    try {
      await setTracks.mutateAsync({ id: album.id, trackIds: tracklist.tracks.map((t) => t.id) })
      close()
      sileo.success({ title: 'Saved', description: album.name })
    } catch (err) {
      setFormError(saveError(err, "Couldn't save the album's tracks. Please try again."))
    }
  }

  return (
    <EditorLayout
      title="Edit tracks"
      tracklist={tracklist}
      requestClose={requestClose}
      error={formError}
      action={
        <Button
          label="Save"
          variant="primary"
          isDisabled={!tracklist.isDirty}
          isLoading={setTracks.isPending}
          onClick={() => void save()}
        />
      }
    >
      <Tracklist draft={tracklist} sharedWith={album.shareCount} />
    </EditorLayout>
  )
}
