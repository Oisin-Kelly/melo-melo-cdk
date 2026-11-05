import { useMediaQuery } from '@astryxdesign/core/hooks'

// Matches AppShell's default mobile breakpoint ('md', 768px), where the side nav
// collapses into the drawer — header pieces switch to their compact form at the same point.
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
