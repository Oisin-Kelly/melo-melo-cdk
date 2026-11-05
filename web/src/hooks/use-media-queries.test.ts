import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsCompact } from './use-is-compact'
import { useIsMobile } from './use-is-mobile'
import { useIsNarrow } from './use-is-narrow'

// Each breakpoint hook asks for one media query; a fake matchMedia answers for a given width
function atWidth(width: number) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)![1]),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('breakpoint hooks', () => {
  it.each([
    // width, narrow (<375), mobile (<768), compact (<1024)
    [320, true, true, true],
    [374, true, true, true],
    [375, false, true, true],
    [767, false, true, true],
    [768, false, false, true],
    [1023, false, false, true],
    [1024, false, false, false],
  ])('at %ipx: narrow %s, mobile %s, compact %s', (width, narrow, mobile, compact) => {
    atWidth(width)
    expect(renderHook(() => useIsNarrow()).result.current).toBe(narrow)
    expect(renderHook(() => useIsMobile()).result.current).toBe(mobile)
    expect(renderHook(() => useIsCompact()).result.current).toBe(compact)
  })
})
