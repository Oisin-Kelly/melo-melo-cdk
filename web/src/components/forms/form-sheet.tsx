import { BottomSheet } from '@astryxdesign/core/BottomSheet'
import { Dialog } from '@astryxdesign/core/Dialog'
import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import './forms.css'

// A big form over the page (Upload, Edit track): a dialog on wider screens; on phones a
// tall bottom sheet instead — the page stays in view above it and a swipe down closes it,
// the way Now playing works. Either way the content is a DialogLayout (header, scrolling
// body, the buttons pinned at the foot). Closing (Escape, the scrim, a swipe) goes through
// `onOpenChange(false)`, so a form can ask before discarding.
export function FormSheet({
  isOpen,
  onOpenChange,
  label,
  width = 1040,
  children,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  label: string
  width?: number
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  if (isMobile)
    return (
      <BottomSheet label={label} isOpen={isOpen} onOpenChange={onOpenChange} height="tall" purpose="form">
        <div className="mm-form-sheet">{children}</div>
      </BottomSheet>
    )
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={width} aria-label={label}>
      {children}
    </Dialog>
  )
}
