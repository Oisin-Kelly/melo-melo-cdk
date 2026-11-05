import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Fragment } from 'react'
import { LIMITS } from '@/config/limits'
import { CountedTextInput } from './counted-text-input'
import { normaliseSlug } from './slug'

// The last part of a track/album/playlist's readable URL (see ./slug.ts for the rules). The API's own
// refusals (a URL already used by another of your items) come back as the form's 400 banner.

type Props = {
  /** The URL up to the slug, e.g. "/oisinkelly/albums/". */
  pathPrefix: string
  value: string
  onChange: (value: string) => void
  /** The form's check of the URL (slugError), shown under the field; null when fine or unchanged. */
  error: string | null
}

export function SlugField({ pathPrefix, value, onChange, error }: Props) {
  const url = `${window.location.host}${pathPrefix}${value}`
  return (
    <VStack gap={1}>
      <CountedTextInput
        label="URL"
        maxLength={LIMITS.slug}
        value={value}
        onChange={(next) => onChange(normaliseSlug(next))}
        autoComplete="off"
        status={error ? { type: 'error', message: error } : undefined}
      />
      {/* The full address, as a preview. One unbroken run is wider than a phone dialog, so it
          may break after each "/" first, and mid-word (.mm-slug-preview) only if a part
          is still too long — the field's own description can't be made to wrap */}
      <Text type="supporting" color="secondary" className="mm-slug-preview">
        {url.split('/').map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <>
                /<wbr />
              </>
            )}
            {part}
          </Fragment>
        ))}
      </Text>
    </VStack>
  )
}
