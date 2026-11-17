import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { sileo } from 'sileo'
import { DetailsFields } from '@/components/forms/details-fields'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { FormSheet } from '@/components/forms/form-sheet'
import { useDetailsDraft } from '@/components/forms/use-details-draft'
import { LIMITS } from '@/config/limits'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { ApiError } from '@/lib/api-client'
import { formatDate, formatDuration } from '@/utils/format'
import { useDownloadOriginal, useUpdateTrack, type Track } from '../api/tracks'
import { TrackComposer } from '@/components/forms/track-composer'

// Edit track: over the track page, like Upload (a big dialog; a bottom sheet on phones) —
// the same composer filled in (the track on the left: cover to change, its title as you
// edit it, length and upload date; its details across the rest), with Download original
// at the start of the footer and Cancel / Save changes at its end. Sharing and Delete stay
// on the track page (Share, ⋯). Closing with unsaved changes asks first.
export function TrackEditDialog({
  track,
  isOpen,
  onOpenChange,
}: {
  track: Track
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}) {
  const [isDirty, setIsDirty] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const close = () => {
    setIsConfirmingDiscard(false)
    setIsDirty(false)
    onOpenChange(false)
  }
  // Cancel, Escape and a swipe down all ask first when there are unsaved changes
  const requestClose = () => (isDirty ? setIsConfirmingDiscard(true) : close())

  return (
    <FormSheet isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : requestClose())} label="Edit track">
      {/* Mounted only while open, so it always starts from the track as it is */}
      {isOpen && <EditForm track={track} close={close} requestClose={requestClose} onDirtyChange={setIsDirty} />}
      <AlertDialog
        isOpen={isConfirmingDiscard}
        onOpenChange={setIsConfirmingDiscard}
        title="Discard changes?"
        description="Your changes to this track's details won't be saved."
        actionLabel="Discard"
        onAction={close}
      />
    </FormSheet>
  )
}

function EditForm({
  track,
  close,
  requestClose,
  onDirtyChange,
}: {
  track: Track
  close: () => void
  requestClose: () => void
  onDirtyChange: (isDirty: boolean) => void
}) {
  const update = useUpdateTrack(track.id)
  const download = useDownloadOriginal(track.id)
  const isMobile = useIsMobile()
  const draft = useDetailsDraft(
    { name: track.name, genre: track.genre ?? '', description: track.description ?? '' },
    {
      descriptionLimit: LIMITS.trackDescription,
      url: track.slug ? { pathPrefix: `/${track.owner.username}/`, slug: track.slug } : undefined,
    },
  )
  const [formError, setFormError] = useState<string | null>(null)
  const currentCover = { imageUrl: track.imageUrl, imageBgColor: track.imageBgColor }
  useEffect(() => {
    onDirtyChange(draft.isDirty)
  }, [draft.isDirty, onDirtyChange])

  const save = async () => {
    if (!draft.canSave) return
    const { name, genre, description, cover, slug } = draft.toDetails()
    try {
      await update.mutateAsync({ name, genre: genre ?? '', description, cover: cover.file, clearCover: cover.clear, slug })
      close()
      // After it has closed: a toast behind an open dialog couldn't be seen
      sileo.success({ title: 'Saved', description: name.trim() })
    } catch (err) {
      // The API's 400s carry a user-safe message (e.g. that URL is already used)
      setFormError(
        err instanceof ApiError && err.status === 400 ? err.message : "Couldn't save your changes. Please try again.",
      )
    }
  }

  return (
    <DialogLayout
      // No ✕: Cancel in the footer closes it (as do Escape and a swipe), asking first with
      // unsaved changes
      header={<DialogHeader title="Edit track" />}
      footer={
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            {/* The file exactly as uploaded (wav, flac…), not the streaming copy; just the
                icon on phones, so Cancel and Save keep their words */}
            <Button
              label="Download original"
              variant="ghost"
              icon={<Icon icon={ArrowDownTrayIcon} />}
              isIconOnly={isMobile}
              isLoading={download.isPending}
              onClick={() => download.mutate()}
            />
          </StackItem>
          <Button label="Cancel" variant="secondary" onClick={requestClose} />
          <Button
            label="Save changes"
            variant="primary"
            isDisabled={!draft.canSave}
            isLoading={update.isPending}
            onClick={() => void save()}
          />
        </HStack>
      }
    >
      <TrackComposer
        draft={draft}
        currentCover={currentCover}
        onCoverError={setFormError}
        meta={
          <Text type="supporting" color="secondary">
            {formatDuration(track.duration)} · Uploaded {formatDate(track.createdAt)}
          </Text>
        }
      >
        <VStack gap={5}>
          {formError && <Banner status="error" title={formError} />}
          <DetailsFields
            draft={draft}
            hasCover={false}
          descriptionRows={3}
            currentCover={currentCover}
            onEnter={() => void save()}
            onCoverError={setFormError}
          />
        </VStack>
      </TrackComposer>
    </DialogLayout>
  )
}
