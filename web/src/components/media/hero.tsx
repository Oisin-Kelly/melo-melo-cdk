import { HStack } from '@astryxdesign/core/HStack'
import { StackItem } from '@astryxdesign/core/Stack'
import { VStack } from '@astryxdesign/core/VStack'
import type { ReactNode } from 'react'
import { BackButton } from '@/components/navigation/back-button'
import { tint } from './tint'
import './media.css'

type Props = {
  /** The cover's (or profile photo's) dominant colour; null falls back to the accent. */
  colour: string | null
  /** Shows the back button; where it goes when there's no previous page (opened from a link). */
  back?: { fallback?: string } | false
  /** Fills the rest of the back button's row (phones), e.g. a search box. */
  backEnd?: ReactNode
  /** No colour wash (a collapsed header). */
  isPlain?: boolean
  children?: ReactNode
}

// The full-bleed, colour-washed top of a detail page (track, album, playlist, profile): an
// optional back button, then the page's own header content.
export function Hero({ colour, back = {}, backEnd, isPlain = false, children }: Props) {
  return (
    <div className={isPlain ? 'mm-hero mm-hero-plain' : 'mm-hero'} style={tint(colour)}>
      <VStack gap={4}>
        {back && backEnd ? (
          <HStack gap={2} vAlign="center" className="mm-hero-back">
            <BackButton fallback={back.fallback} />
            <StackItem size="fill">{backEnd}</StackItem>
          </HStack>
        ) : (
          back && <BackButton fallback={back.fallback} className="mm-hero-back" />
        )}
        {children}
      </VStack>
    </div>
  )
}
