import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { DialogHeader } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowUpTrayIcon, CheckCircleIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { sileo } from 'sileo'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { FormSheet } from '@/components/forms/form-sheet'
import { DetailsFields } from '@/components/forms/details-fields'
import { FileInput } from '@/components/forms/file-input'
import { lengthError } from '@/components/forms/saved-text'
import { useDetailsDraft } from '@/components/forms/use-details-draft'
import { PeoplePicker, type Person } from '@/components/sharing/people-picker'
import { LIMITS } from '@/config/limits'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { ApiError } from '@/lib/api-client'
import { AUDIO_ACCEPT, stageUploadWithProgress } from '@/lib/dropbox'
import { useDismissUpload, useUploadStatus, useUploadTrack, type UploadState } from '../api/upload'
import { TrackComposer } from '@/components/forms/track-composer'
import { UploadContext } from './upload-context'
import { audioFileError, nameFromFile } from './upload-files'
import './upload.css'

// Upload: a big dialog over whatever page you're on (a tall bottom sheet on phones), opened by the header's Upload buttons
// (and /upload links) through UploadProvider. Three steps on an Astryx Stepper, which is the
// dialog's title — Audio, Details, Share — with Cancel / Back / Next / Upload in its footer
// like every other dialog. It opens on a drop zone (a file dragged anywhere over the window
// lights it up); picking a file starts it uploading in the background and moves on to
// Details, where the track takes shape in the composer. Upload hands it to the server, which
// gets it ready; the dialog can be closed meanwhile — its state lives here, mounted for the
// whole app, so it still lands (with a toast) when you're elsewhere.

export function UploadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const value = useMemo(() => ({ open: () => setIsOpen(true) }), [])
  return (
    <UploadContext value={value}>
      {children}
      <UploadDialog isOpen={isOpen} onOpenChange={setIsOpen} />
    </UploadContext>
  )
}

const EMPTY_DETAILS = { name: '', genre: '', description: '' }

function UploadDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  // A fresh form for each new upload: everything below is keyed by it
  const [session, setSession] = useState(0)
  return (
    <UploadFlow
      key={session}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onFinished={() => setSession((n) => n + 1)}
    />
  )
}

function UploadFlow({
  isOpen,
  onOpenChange,
  onFinished,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Done with this upload (landed, or discarded): start the next one afresh */
  onFinished: () => void
}) {
  const navigate = useNavigate()
  const staging = useAudioStaging()
  const draft = useDetailsDraft(EMPTY_DETAILS, { descriptionLimit: LIMITS.trackDescription })
  const [people, setPeople] = useState<Person[]>([])
  const [caption, setCaption] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState<{ trackId: string; name: string; startedAt: number } | null>(null)
  const [step, setStep] = useState(0)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const isDraggingFile = useWindowFileDrag(isOpen && sent === null, (file) => pickFile(file))
  const upload = useUploadTrack()
  const dismissUpload = useDismissUpload()
  const status = useUploadStatus(sent?.trackId ?? null, sent?.startedAt ?? 0)

  const captionError = lengthError(caption, LIMITS.caption, 'multi')
  const detailsAreValid = Object.values(draft.errors).every((error) => error === null)
  const state = status.data?.status

  // Ready: open it if the dialog's still up, otherwise say so; either way this upload's done
  const isOpenRef = useRef(isOpen)
  useEffect(() => {
    isOpenRef.current = isOpen
  })
  useEffect(() => {
    if (state !== 'COMPLETE' || !sent) return
    if (isOpenRef.current) {
      onOpenChange(false)
      navigate(`/tracks/${sent.trackId}`)
    }
    // After the dialog has closed: a toast behind an open dialog couldn't be seen
    sileo.success({ title: 'Uploaded', description: sent.name })
    onFinished()
  }, [state, sent, navigate, onOpenChange, onFinished])
  // Failed while closed: say so (open it again to try another file)
  useEffect(() => {
    if (state === 'FAILED' && sent && !isOpenRef.current)
      sileo.error({ title: `Couldn't upload ${sent.name}`, description: 'Open Upload to try another file.' })
  }, [state, sent])

  // Unsent work is only lost after asking; once sent, closing just hides it
  const isUnsent = sent === null && (staging.file !== null || draft.isDirty)
  const close = () => {
    setIsConfirmingDiscard(false)
    onOpenChange(false)
  }
  const requestClose = () => (isUnsent ? setIsConfirmingDiscard(true) : close())
  const discard = () => {
    staging.clear()
    close()
    onFinished()
  }
  // Leaving the site with unsent work asks the browser's own question
  useEffect(() => {
    if (!isUnsent) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isUnsent])

  function pickFile(file: File) {
    const error = audioFileError(file)
    if (error) {
      staging.reject(file, error)
      return setStep(0)
    }
    if (!draft.name.trim()) draft.setName(nameFromFile(file.name))
    staging.start(file)
    // On to the details while it goes up
    setStep((current) => Math.max(current, 1))
  }

  const send = async () => {
    if (!draft.canSave || !detailsAreValid || captionError) return
    setFormError(null)
    setIsSending(true)
    try {
      // The audio may still be on its way up: Upload waits for it
      const audioKey = await staging.whenStaged()
      const { name, genre, description, cover } = draft.toDetails()
      const { trackId } = await upload.mutateAsync({
        audioKey,
        name,
        genre: genre ?? '',
        description,
        cover: cover.file,
        sharedWith: people.map((p) => p.id),
        caption,
      })
      setSent({ trackId, name: name.trim(), startedAt: Date.now() })
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 400 ? err.message : "Couldn't upload it. Please try again.",
      )
    } finally {
      setIsSending(false)
    }
  }

  // Processing failed: back to choosing audio, keeping the details and who it's for. The
  // failed attempt's row leaves Your tracks — the next try is its own upload.
  const tryAnotherFile = () => {
    if (sent) dismissUpload.mutate(sent.trackId)
    setSent(null)
    upload.reset()
    staging.clear()
    setStep(0)
  }

  const stepper = (
    <Stepper
      label="Upload steps"
      density="compact"
      // The on-track layout: each step's dot or tick sits on the line itself
      indicatorPosition="on-track"
      activeStep={sent ? 3 : step}
      // Any step that can be shown: Details needs a file, Share valid details (phones'
      // collapsed stepper steps through with its own arrows)
      onStepClick={
        sent
          ? undefined
          : (index) => {
              if (index === 0 || (index === 1 && staging.file) || (index === 2 && staging.file && detailsAreValid))
                setStep(index)
            }
      }
    >
      <Step step={0} label="Audio" />
      <Step step={1} label="Details" />
      <Step step={2} label="Share" />
    </Stepper>
  )

  const composer = (body: ReactNode) => (
    <TrackComposer
      draft={draft}
      currentCover={{ imageUrl: null, imageBgColor: null }}
      onCoverError={setFormError}
      meta={sent ? null : <AudioProgress staging={staging} onReplace={pickFile} />}
      isCoverLocked={sent !== null}
    >
      {body}
    </TrackComposer>
  )

  const cancel = <Button label="Cancel" variant="secondary" onClick={requestClose} />
  let body: ReactNode
  let footer: ReactNode
  if (sent) {
    body = composer(<Processing state={state} error={status.data?.error} />)
    footer =
      state === 'FAILED' ? (
        <HStack gap={2} hAlign="end">
          <Button label="Close" variant="secondary" onClick={close} />
          <Button label="Try another file" variant="primary" onClick={tryAnotherFile} />
        </HStack>
      ) : (
        <HStack gap={2} hAlign="end">
          <Button label="Close" variant="secondary" onClick={close} />
        </HStack>
      )
  } else if (step === 0 || !staging.file) {
    body = <AudioStep staging={staging} isDraggingFile={isDraggingFile} onFile={pickFile} />
    footer = (
      <HStack gap={2} hAlign="end">
        {cancel}
        {staging.file && <Button label="Next" variant="primary" onClick={() => setStep(1)} />}
      </HStack>
    )
  } else if (step === 1) {
    body = composer(
      <VStack gap={5}>
        {formError && <Banner status="error" title={formError} />}
        <DetailsFields
          draft={draft}
          hasCover={false}
          descriptionRows={3}
          currentCover={{ imageUrl: null, imageBgColor: null }}
          onEnter={() => detailsAreValid && setStep(2)}
          onCoverError={setFormError}
        />
      </VStack>,
    )
    footer = (
      <HStack gap={2} hAlign="end">
        {cancel}
        <Button label="Back" variant="secondary" onClick={() => setStep(0)} />
        <Button label="Next" variant="primary" isDisabled={!detailsAreValid} onClick={() => setStep(2)} />
      </HStack>
    )
  } else {
    body = composer(
      <VStack gap={5}>
        {formError && <Banner status="error" title={formError} />}
        <VStack gap={1}>
          <Heading level={2}>Share it</Heading>
          <Text type="body" color="secondary">
            Optional — or keep it to yourself for now and share it from its page later.
          </Text>
        </VStack>
        <PeoplePicker label="Share with" value={people} onChange={setPeople} />
        {people.length > 0 && (
          <TextArea
            label="Caption"
            isOptional
            description="Shown with the track in their feed."
            value={caption}
            onChange={setCaption}
            maxLength={LIMITS.caption}
            rows={3}
            status={captionError ? { type: 'error', message: captionError } : undefined}
          />
        )}
      </VStack>,
    )
    footer = (
      <HStack gap={2} hAlign="end">
        {cancel}
        <Button label="Back" variant="secondary" onClick={() => setStep(1)} />
        <Button
          label={people.length > 0 ? `Upload and share with ${people.length}` : 'Upload'}
          variant="primary"
          icon={<Icon icon={ArrowUpTrayIcon} />}
          isDisabled={!draft.canSave || !detailsAreValid || Boolean(captionError) || staging.error !== null}
          isLoading={isSending}
          onClick={() => void send()}
        />
      </HStack>
    )
  }

  return (
    <FormSheet
        isOpen={isOpen}
        onOpenChange={(open) => (open ? onOpenChange(true) : requestClose())}
        label="Upload a track"
      >
        {/* No ✕: Cancel in the footer closes it (as does Escape), asking first if anything would be lost */}
        <DialogLayout header={<DialogHeader title={stepper} />} footer={footer}>
          <div className="mm-upload-body">{body}</div>
        </DialogLayout>
        <AlertDialog
          isOpen={isConfirmingDiscard}
          onOpenChange={setIsConfirmingDiscard}
          title="Discard this upload?"
          description="You haven't uploaded this track yet. If you close now, it won't be uploaded."
          actionLabel="Discard"
          onAction={discard}
        />
        {/* A file dragged over a later step replaces the audio */}
        {isDraggingFile && step > 0 && !sent && (
          <div className="mm-upload-overlay" aria-hidden>
            <Text type="label" weight="semibold">
              Drop to replace the audio
            </Text>
          </div>
        )}
    </FormSheet>
  )
}

// A file being dragged anywhere over the window (not just over the drop zone), so the page
// can react the moment it arrives; dropping it anywhere picks it. Off once it's been sent.
function useWindowFileDrag(isEnabled: boolean, onDrop: (file: File) => void): boolean {
  const [isDragging, setIsDragging] = useState(false)
  const dropRef = useRef(onDrop)
  useEffect(() => {
    dropRef.current = onDrop
  })
  useEffect(() => {
    if (!isEnabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'))
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setIsDragging(true)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setIsDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setIsDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) dropRef.current(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      setIsDragging(false)
    }
  }, [isEnabled])
  return isDragging
}

// ---- step 1: the audio ----

// A small card in the middle of the dialog — the whole card is the button to choose a
// file — with what it takes, and a line on who'll hear it. A file dragged anywhere over the
// window lights it up (wider screens; phones choose). Back here with a file already picked,
// it offers a different one (Next is in the footer).
function AudioStep({
  staging,
  isDraggingFile,
  onFile,
}: {
  staging: Staging
  isDraggingFile: boolean
  onFile: (file: File) => void
}) {
  const isMobile = useIsMobile()
  const input = useRef<HTMLInputElement>(null)
  const title = isDraggingFile
    ? 'Drop to upload'
    : staging.file
      ? 'Choose a different file'
      : isMobile
        ? 'Choose an audio file to upload'
        : 'Drop an audio file here, or choose one'

  return (
    <div className="mm-audio-step">
      <VStack gap={4} hAlign="center">
        <button
          type="button"
          className="mm-drop-card"
          data-active={isDraggingFile || undefined}
          onClick={() => input.current?.click()}
        >
          <span className="mm-drop-card-icon">
            <Icon icon={CloudArrowUpIcon} />
          </span>
          <Text type="body" weight="semibold">
            {title}
          </Text>
          <Text type="supporting" color="secondary">
            WAV, FLAC, AIFF, MP3, M4A and more · up to 300 MB
          </Text>
        </button>
        {staging.error && !staging.file && <Banner status="error" title={staging.error} />}
        <Text type="supporting" color="secondary" className="mm-audio-step-note">
          Only you can hear it until you share it — you'll choose who in step 3.
        </Text>
      </VStack>
      <FileInput ref={input} accept={AUDIO_ACCEPT} onPick={onFile} />
    </div>
  )
}

// ---- the audio, uploading in the background ----

type Staging = ReturnType<typeof useAudioStaging>

// The picked audio goes up to the dropbox as soon as it's picked, while the details are
// filled in; `whenStaged` is what Upload waits on. Picking another file, clearing or
// leaving the page cancels the one in flight.
function useAudioStaging() {
  const [state, setState] = useState<{ file: File | null; progress: number; key: string | null; error: string | null }>(
    { file: null, progress: 0, key: null, error: null },
  )
  const controller = useRef<AbortController | null>(null)
  const pending = useRef<Promise<string> | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const start = (file: File) => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setState({ file, progress: 0, key: null, error: null })
    const forThisFile = (update: (s: typeof state) => typeof state) =>
      setState((s) => (s.file === file ? update(s) : s))
    const staged = stageUploadWithProgress(file, 'audio', (progress) => forThisFile((s) => ({ ...s, progress })), ctrl.signal)
    pending.current = staged
    staged.then(
      (key) => forThisFile((s) => ({ ...s, key, progress: 1 })),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        forThisFile((s) => ({ ...s, error: "Couldn't upload the file. Check your connection and try again." }))
      },
    )
  }

  return {
    ...state,
    start,
    /** A file that won't do (too big, not audio): say why on the drop stage */
    reject: (_file: File, error: string) => {
      controller.current?.abort()
      setState({ file: null, progress: 0, key: null, error })
    },
    retry: () => state.file && start(state.file),
    clear: () => {
      controller.current?.abort()
      pending.current = null
      setState({ file: null, progress: 0, key: null, error: null })
    },
    whenStaged: () => (state.key ? Promise.resolve(state.key) : pending.current ?? Promise.reject(new Error('No file'))),
  }
}

// Under the preview's title, a line each so nothing is cut but a long file name: the file's
// name, its size and how it's going (uploading, uploaded, or failed with Retry), then
// Replace file
function AudioProgress({ staging, onReplace }: { staging: Staging; onReplace: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { file, progress, key, error } = staging
  if (!file) return null
  const size = `${(file.size / (1024 * 1024)).toFixed(file.size < 10 * 1024 * 1024 ? 1 : 0)} MB`

  return (
    <VStack gap={2}>
      <VStack gap={0.5}>
        <Text type="supporting" weight="semibold" maxLines={1}>
          {file.name}
        </Text>
        {error ? (
          <Text type="supporting" color="secondary">
            {size} · {error}
          </Text>
        ) : key ? (
          <HStack gap={1} vAlign="center">
            <Text type="supporting" color="secondary">
              {size} ·
            </Text>
            <Icon icon={CheckCircleIcon} color="success" size="sm" />
            <Text type="supporting" color="secondary">
              Uploaded
            </Text>
          </HStack>
        ) : (
          <Text type="supporting" color="secondary">
            {size} · Uploading {Math.round(progress * 100)}%
          </Text>
        )}
      </VStack>
      {!key && !error && <ProgressBar label="Uploading audio" value={Math.round(progress * 100)} />}
      <HStack gap={2}>
        {error && <Button label="Retry" variant="primary" size="sm" onClick={staging.retry} />}
        <Button
          label="Replace file"
          variant="secondary"
          size="sm"
          icon={<Icon icon={ArrowUpTrayIcon} />}
          onClick={() => input.current?.click()}
        />
      </HStack>
      <FileInput ref={input} accept={AUDIO_ACCEPT} onPick={onReplace} />
    </VStack>
  )
}

// ---- after Upload ----

// Waiting on the server: getting it ready (closing is fine — it carries on), or why it
// couldn't. The buttons are in the dialog's footer.
function Processing({ state, error }: { state: UploadState | undefined; error: string | null | undefined }) {
  if (state === 'FAILED')
    return (
      <VStack gap={4} className="mm-upload-processing">
        <Banner status="error" title="We couldn't use that file" description={error ?? 'Audio processing failed.'} />
        <Text type="body" color="secondary">
          Your details and who it's for are kept — try another file.
        </Text>
      </VStack>
    )

  return (
    <VStack gap={4} hAlign="start" className="mm-upload-processing">
      <HStack gap={3} vAlign="center">
        <Spinner size="md" />
        <Heading level={2}>Getting it ready…</Heading>
      </HStack>
      <Text type="body" color="secondary">
        This usually takes under a minute. You can close this — it carries on, and it'll be on your profile (and
        with anyone you shared it with) when it's ready.
      </Text>
    </VStack>
  )
}
