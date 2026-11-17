import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { PhotoIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CurrentCover, DetailsDraft } from './use-details-draft'
import { FileInput } from './file-input'
import { CoverArt } from '@/components/media/cover-art'
import { IMAGE_ACCEPT, imageFileError } from '@/lib/dropbox'
import './track-composer.css'

// A track (or an album: New album) being made or edited, laid out around the thing itself: on the left, a preview
// of how it'll look — the cover (tap to add or change it), its title as you type it and
// `meta` (upload progress, or its length and upload date) — and the fields filling the rest
// of the width. Upload and Edit track are both this; phones stack it.
export function TrackComposer({
  draft,
  currentCover,
  onCoverError,
  meta,
  isCoverLocked = false,
  children,
}: {
  draft: DetailsDraft
  currentCover: CurrentCover
  onCoverError: (message: string) => void
  meta?: ReactNode
  /** Sent and being processed: the cover can't change any more */
  isCoverLocked?: boolean
  children: ReactNode
}) {
  return (
    <div className="mm-composer">
      <aside className="mm-composer-preview" aria-label="Preview">
        <ComposerCover draft={draft} currentCover={currentCover} onError={onCoverError} isLocked={isCoverLocked} />
        <VStack gap={2} className="mm-composer-heading">
          <Heading level={2} maxLines={2}>
            {draft.name.trim() || 'Untitled'}
          </Heading>
          {meta}
        </VStack>
      </aside>
      <div className="mm-composer-fields">{children}</div>
    </div>
  )
}

// The cover as a big square button: picking a file previews it at once (it's uploaded with
// the rest on save). Remove under it goes back to no cover — or, for a just-picked one, to
// the saved cover.
function ComposerCover({
  draft,
  currentCover,
  onError,
  isLocked,
}: {
  draft: DetailsDraft
  currentCover: CurrentCover
  onError: (message: string) => void
  isLocked: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [pickedUrl, setPickedUrl] = useState<string | null>(null)
  useEffect(() => () => (pickedUrl ? URL.revokeObjectURL(pickedUrl) : undefined), [pickedUrl])

  const imageUrl = pickedUrl ?? (draft.cover.clear ? null : currentCover.imageUrl)
  const pick = (file: File) => {
    const error = imageFileError(file)
    if (error) return onError(error)
    setPickedUrl(URL.createObjectURL(file))
    draft.setCover({ file, clear: false })
  }
  const remove = () => {
    setPickedUrl(null)
    draft.setCover({ file: null, clear: Boolean(currentCover.imageUrl) })
  }

  if (isLocked)
    return (
      <span className="mm-composer-cover">
        <CoverArt imageUrl={imageUrl} imageBgColor={currentCover.imageBgColor} size="xl" />
      </span>
    )

  return (
    <VStack gap={2} className="mm-composer-cover-block">
      <button
        type="button"
        className="mm-composer-cover"
        onClick={() => input.current?.click()}
        aria-label={imageUrl ? 'Change cover' : 'Add cover'}
      >
        <CoverArt imageUrl={imageUrl} imageBgColor={currentCover.imageBgColor} size="xl" />
        <span className="mm-composer-cover-hint" data-empty={!imageUrl || undefined}>
          <Icon icon={PhotoIcon} />
          <Text type="label" weight="semibold">
            {imageUrl ? 'Change cover' : 'Add cover'}
          </Text>
        </span>
      </button>
      {imageUrl && <Button label="Remove cover" variant="ghost" size="sm" onClick={remove} />}
      <FileInput ref={input} accept={IMAGE_ACCEPT} onPick={pick} />
    </VStack>
  )
}
