import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Illustration } from '@/components/illustrations/illustration'

type What = 'track' | 'album' | 'playlist'

// "Not available" deliberately covers both "doesn't exist" and "you can't see it" — the API
// answers both with the same 404, and so does the screen (a readable URL is guessable)
const MISSING: Record<What, { title: string; description: string }> = {
  track: { title: "This track isn't available", description: "It may have been deleted, or it's no longer shared with you." },
  album: { title: "This album isn't available", description: "It may have been deleted, or it's no longer shared with you." },
  playlist: { title: "This playlist doesn't exist", description: 'It may have been deleted.' },
}

/** A detail page's failed load: 404 → not available, anything else → retry. */
export function UnavailableScreen({ what, isMissing, onRetry }: { what: What; isMissing: boolean; onRetry: () => void }) {
  return isMissing ? (
    <EmptyState
      icon={<Illustration name="lost" />}
      title={MISSING[what].title}
      description={MISSING[what].description}
      actions={<Button label="Go home" href="/" />}
    />
  ) : (
    <EmptyState
      icon={<Illustration name="lost" />}
      title={`Couldn't load this ${what}`}
      description="Check your connection and try again."
      actions={<Button label="Try again" onClick={onRetry} />}
    />
  )
}
