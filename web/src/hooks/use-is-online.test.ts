import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsOnline } from './use-is-online'

afterEach(() => vi.restoreAllMocks())

describe('useIsOnline', () => {
  it("follows the browser's online/offline events", () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { result } = renderHook(() => useIsOnline())
    expect(result.current).toBe(true)

    onLine.mockReturnValue(false)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe(false)

    onLine.mockReturnValue(true)
    act(() => window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(true)
  })

  it('stops listening when unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIsOnline())

    unmount()

    expect(remove.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['online', 'offline']))
  })
})
