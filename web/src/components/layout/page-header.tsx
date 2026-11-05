import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import './page-header.css'

type Props = {
  title: string
  /** The page's main picker (e.g. All / Tracks / Albums). */
  picker?: ReactNode
  /** Secondary controls (e.g. sort). */
  actions?: ReactNode
}

// A top-level page's title row. Desktop: title left, picker + actions right. Phones:
// one row of title | picker | actions, the picker dead centre (in line with the logo
// above) because the two side columns are equal.
export function PageHeader({ title, picker, actions }: Props) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="mm-page-header-phone">
        <Heading level={1}>{title}</Heading>
        {picker ?? <span />}
        <span className="mm-page-header-end">{actions}</span>
      </div>
    )
  }

  return (
    <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={1}>{title}</Heading>
      <HStack gap={2} vAlign="center">
        {picker}
        {actions}
      </HStack>
    </HStack>
  )
}
