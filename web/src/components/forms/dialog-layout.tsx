import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import type { ReactNode } from 'react'

type Props = {
  /** Usually a DialogHeader. */
  header: ReactNode
  children: ReactNode
  /** The buttons; stays pinned under the scrolling body. */
  footer?: ReactNode
}

// Astryx's dialog form structure (the DialogFormDialog template): the header and the
// buttons stay put, and only the body scrolls when the dialog is taller than the screen.
export function DialogLayout({ header, children, footer }: Props) {
  return (
    <Layout
      header={header}
      content={<LayoutContent>{children}</LayoutContent>}
      footer={footer && <LayoutFooter>{footer}</LayoutFooter>}
    />
  )
}
