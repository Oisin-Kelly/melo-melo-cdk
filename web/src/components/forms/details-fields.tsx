import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { LIMITS } from '@/config/limits'
import { CountedTextInput } from './counted-text-input'
import { CoverPicker } from './cover-picker'
import { GenreField } from './genre-field'
import { SlugField } from './slug-field'
import type { CurrentCover, DetailsDraft } from './use-details-draft'

const errorStatus = (message: string | null) => (message ? ({ type: 'error', message } as const) : undefined)

/** The fields for a `useDetailsDraft`. `onCoverPicked` clears a form-level error; a
 *  picked cover the server won't take goes to `onCoverError`. */
export function DetailsFields({
  draft,
  currentCover,
  onEnter,
  onCoverPicked,
  onCoverError,
  hasAutoFocus = false,
  hasCover = true,
  descriptionRows = 5,
}: {
  draft: DetailsDraft
  currentCover: CurrentCover
  onEnter?: () => void
  onCoverPicked?: () => void
  onCoverError: (message: string) => void
  hasAutoFocus?: boolean
  /** Off where the cover is picked elsewhere (the track composer's big preview) */
  hasCover?: boolean
  /** The description box's height (the composers keep it shorter, so the form fits) */
  descriptionRows?: number
}) {
  return (
    <VStack gap={4}>
      {hasCover && (
        <CoverPicker
          imageUrl={currentCover.imageUrl}
          imageBgColor={currentCover.imageBgColor}
          onChange={(change) => {
            draft.setCover(change)
            onCoverPicked?.()
          }}
          onError={onCoverError}
        />
      )}
      <CountedTextInput
        label="Name"
        maxLength={LIMITS.name}
        value={draft.name}
        onChange={draft.setName}
        onEnter={onEnter}
        hasAutoFocus={hasAutoFocus}
        status={errorStatus(draft.errors.name)}
      />
      {draft.hasGenre && <GenreField value={draft.genre} onChange={draft.setGenre} error={draft.errors.genre} />}
      <TextArea
        label="Description"
        isOptional
        value={draft.description}
        onChange={draft.setDescription}
        maxLength={draft.descriptionLimit}
        rows={descriptionRows}
        status={errorStatus(draft.errors.description)}
      />
      {draft.url && (
        <SlugField pathPrefix={draft.url.pathPrefix} value={draft.slug} onChange={draft.setSlug} error={draft.errors.url} />
      )}
    </VStack>
  )
}
