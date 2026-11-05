import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useGoBack } from './go-back'

type Props = {
  /** Where to go when there's no in-app page to go back to (opened from a link). */
  fallback?: string
  /** Positions it in its context (e.g. "mm-hero-back", "mm-page-back"). */
  className?: string
}

// "<-" at the top of detail pages, on phones only: wider screens have the side nav and the
// browser's own back, so it renders nothing there (wrapper included, so no gap is left).
// Goes back in history when the previous entry is ours (the data router numbers its
// entries in history.state.idx); on a deep link that would leave the site, so it goes to
// the fallback instead.
export function BackButton({ fallback = '/', className }: Props) {
  const goBack = useGoBack(fallback)
  const isMobile = useIsMobile()

  if (!isMobile) return null
  return (
    <div className={className}>
      <IconButton
        label="Back"
        variant="ghost"
        icon={<Icon icon={ArrowLeftIcon} />}
        onClick={goBack}
      />
    </div>
  )
}
