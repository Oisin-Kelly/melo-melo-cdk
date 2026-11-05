import { useMediaQuery } from '@astryxdesign/core/hooks'

// Below 1024px the main content area is phone-sized — on tablets and narrow windows the
// side nav still takes its width — so detail headers use their short phone arrangement
// there (CollectionHeader).
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}
