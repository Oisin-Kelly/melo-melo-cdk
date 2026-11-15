import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { useState, type ReactNode } from 'react'
import { sileo } from 'sileo'
import { ApiError } from '@/lib/api-client'
import { DialogLayout } from './dialog-layout'
import { DetailsFields } from './details-fields'
import { useDetailsDraft, type CurrentCover, type Details } from './use-details-draft'

export type { CurrentCover, Details } from './use-details-draft'

type Props = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** "Edit playlist" / "Edit album". */
  title: string
  /** A `genre` (even empty) adds the Genre field. */
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

// Cover, name, description and URL editor for albums and playlists (tracks have their own
// page, features/tracks TrackEditPage, built from the same details-fields.tsx). The
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

function DetailsForm({
  close,
  header,
  initial,
  descriptionLimit,
  cover: currentCover,
  url,
  isSaving,
  onSave,
}: Omit<Props, 'isOpen' | 'onOpenChange' | 'title'> & { close: () => void; header: ReactNode }) {
  const draft = useDetailsDraft(initial, { descriptionLimit, url })
  // A picked cover the server won't take, or the API's own 400 message: shown above the form
  const [formError, setFormError] = useState<string | null>(null)

  const save = async () => {
    if (!draft.canSave) return
    try {
      await onSave(draft.toDetails())
      sileo.success({ title: 'Saved', description: draft.name.trim() })
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
          <Button label="Save" variant="primary" isDisabled={!draft.canSave} isLoading={isSaving} onClick={() => void save()} />
        </HStack>
      }
    >
      <VStack gap={4}>
        {formError && <Banner status="error" title={formError} />}
        <DetailsFields
          draft={draft}
          currentCover={currentCover}
          onEnter={() => void save()}
          onCoverPicked={() => setFormError(null)}
          onCoverError={setFormError}
          hasAutoFocus
        />
      </VStack>
    </DialogLayout>
  )
}
