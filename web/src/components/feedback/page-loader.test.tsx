import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOADING_PHRASES } from './loading-phrases'
import { PageLoader } from './page-loader'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

// The spinner carries the phrase as its accessible label; the wrapper fades in after 200ms
const loader = () => document.querySelector('.mm-page-loader')!
const label = () => loader().querySelector('[aria-label]')!.getAttribute('aria-label')

describe('PageLoader', () => {
  it("says something from the screen's own phrases", () => {
    render(<PageLoader what="album" />)
    expect(LOADING_PHRASES.album).toContain(label())
  })

  it('stays invisible for the first 200ms so quick loads never flash', () => {
    render(<PageLoader />)
    expect(loader()).toHaveAttribute('data-shown', 'false')

    act(() => vi.advanceTimersByTime(200))

    expect(loader()).toHaveAttribute('data-shown', 'true')
  })

  it('admits a long wait: "Still going" at 4s, "Nearly there" at 10s', () => {
    render(<PageLoader what="track" />)

    act(() => vi.advanceTimersByTime(4_000))
    expect(label()).toBe('Still going')

    act(() => vi.advanceTimersByTime(6_000))
    expect(label()).toBe('Nearly there')
  })

  it('clears its timers when the content arrives', () => {
    const { unmount } = render(<PageLoader />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
