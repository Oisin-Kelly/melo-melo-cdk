import { useMediaQuery } from '@astryxdesign/core/hooks'

// The smallest phones (iPhone SE and similar, under 375px wide), where a header's image
// has to shrink to leave the text beside it a readable width.
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 374px)')
}
