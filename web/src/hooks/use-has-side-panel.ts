import { useMediaQuery } from '@astryxdesign/core/hooks'

// From 1280px there's room beside the main content for a side panel (Home's People you may
// know) without squeezing it — the side nav takes its width too
export function useHasSidePanel(): boolean {
  return !useMediaQuery('(max-width: 1279px)')
}
