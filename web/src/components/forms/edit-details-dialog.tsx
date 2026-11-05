import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { useState, type ReactNode } from 'react'
import { sileo } from 'sileo'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import { CountedTextInput } from './counted-text-input'
import { CoverPicker, type CoverChange } from './cover-picker'
import { DialogLayout } from './dialog-layout'
import { lengthError } from './saved-text'
import { slugError } from './slug'
import { SlugField } from './slug-field'

/** `slug` is set only when the URL was changed (leaving it out keeps the current one);
 *  `genre` only for a form that has the field. */
export type Details = { name: string; description: string; genre?: string; cover: CoverChange; slug?: string }

/** The current cover, shown in the picker. */
export type CurrentCover = { imageUrl: string | null; imageBgColor: string | null }

type Props = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** "Edit playlist" / "Edit album" / "Edit track". */
  title: string
  /** A `genre` (even empty) adds the Genre field — tracks. */
  initial: { name: string; description: string; genre?: string }
  /** The API's limit for this kind's description (config/limits.ts). */
  descriptionLimit?: number
  cover: CurrentCover
  /** The readable URL's editable end; omitted for items without one yet. */
  url?: { pathPrefix: string; slug: string }
  isSaving: boolean
  /** Rejects with the API's error; a 400 carries a user-safe message shown inline. */
  onSave: (details: Details) => Promise<unknown>
}

// Cover, name, (genre,) description and URL editor for tracks, albums and playlists. The
// form is mounted only while open, so it always starts from the current values. Header
// and buttons stay put while the body scrolls (DialogLayout).
export function EditDetailsDialog({ isOpen, onOpenChange, title, ...rest }: Props) {
  const close = () => onOpenChange(false)
  return (
    // aria-label: the header mounts with the form (after opening), too late for the
    // dialog to pick up its title as its name
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={540} aria-label={title}>
      {isOpen && <DetailsForm close={close} header={<DialogHeader title={title} onOpenChange={close} />} {...rest} />}
    </Dialog>
  )
}

const errorStatus = (message: string | null) => (message ? ({ type: 'error', message } as const) : undefined)

function DetailsForm({
  close,
  header,
  initial,
  descriptionLimit = LIMITS.description,
  cover: currentCover,
  url,
  isSaving,
  onSave,
}: Omit<Props, 'isOpen' | 'onOpenChange' | 'title'> & { close: () => void; header: ReactNode }) {
  const hasGenre = initial.genre !== undefined
  const [name, setName] = useState(initial.name)
  const [genre, setGenre] = useState(initial.genre ?? '')
  const [description, setDescription] = useState(initial.description)
  const [slug, setSlug] = useState(url?.slug ?? '')
  const [cover, setCover] = useState<CoverChange>({ file: null, clear: false })
  // A picked cover the server won't take, or the API's own 400 message: shown above the form
  const [formError, setFormError] = useState<string | null>(null)

  // Each field's own check, shown under that field (the API's limits, config/limits.ts)
  const nameError = name.trim() ? lengthError(name, LIMITS.name) : 'Give it a name.'
  const genreError = lengthError(genre, LIMITS.genre)
  const descriptionError = lengthError(description, descriptionLimit, 'multi')
  const slugChanged = url !== undefined && slug !== url.slug
  const urlError = slugChanged ? slugError(slug) : null
  const isDirty =
    name !== initial.name ||
    genre !== (initial.genre ?? '') ||
    description !== initial.description ||
    cover.file !== null ||
    cover.clear ||
    slugChanged
  const canSave = isDirty && !nameError && !genreError && !descriptionError && !urlError

  const save = async () => {
    if (!canSave) return
    try {
      await onSave({ name, description, ...(hasGenre && { genre }), cover, slug: slugChanged ? slug : undefined })
      sileo.success({ title: 'Saved', description: name.trim() })
      close()
    } catch (err) {
      // The API's 400s carry a user-safe message (e.g. that URL is already used)
      if (err instanceof ApiError && err.status === 400) setFormError(err.message)
      // Shown in the dialog, not as a toast: it would sit behind the open dialog
      else setFormError("Couldn't save your changes. Please try again.")
    }
  }

  return (
    <DialogLayout
      header={header}
      footer={
        <HStack gap={2} hAlign="end">
          <Button label="Cancel" variant="ghost" onClick={close} />
          <Button label="Save" variant="primary" isDisabled={!canSave} isLoading={isSaving} onClick={() => void save()} />
        </HStack>
      }
    >
      <VStack gap={4}>
        {formError && <Banner status="error" title={formError} />}
        <CoverPicker
          imageUrl={currentCover.imageUrl}
          imageBgColor={currentCover.imageBgColor}
          onChange={(change) => {
            setCover(change)
            setFormError(null)
          }}
          onError={setFormError}
        />
        <CountedTextInput
          label="Name"
          maxLength={LIMITS.name}
          value={name}
          onChange={setName}
          onEnter={() => void save()}
          hasAutoFocus
          status={errorStatus(nameError)}
        />
        {hasGenre && (
          <CountedTextInput
            label="Genre"
            isOptional
            maxLength={LIMITS.genre}
            value={genre}
            onChange={setGenre}
            status={errorStatus(genreError)}
          />
        )}
        <TextArea
          label="Description"
          isOptional
          value={description}
          onChange={setDescription}
          maxLength={descriptionLimit}
          rows={5}
          status={errorStatus(descriptionError)}
        />
        {url && <SlugField pathPrefix={url.pathPrefix} value={slug} onChange={setSlug} error={urlError} />}
      </VStack>
    </DialogLayout>
  )
}
