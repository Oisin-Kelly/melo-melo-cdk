import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeModeProvider } from './theme-mode'
import { useThemeMode } from './use-theme-mode'
import { useThemeModeItems } from './use-theme-mode-items'

const KEY = 'melomelo.theme-mode'
const wrapper = ({ children }: { children: ReactNode }) => <ThemeModeProvider>{children}</ThemeModeProvider>

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ThemeModeProvider', () => {
  it('defaults to following the system', () => {
    const { result } = renderHook(() => useThemeMode(), { wrapper })
    expect(result.current.mode).toBe('system')
  })

  it.each(['light', 'dark'] as const)('starts from a stored %s choice', (mode) => {
    localStorage.setItem(KEY, mode)
    const { result } = renderHook(() => useThemeMode(), { wrapper })
    expect(result.current.mode).toBe(mode)
  })

  it('ignores a junk stored value', () => {
    localStorage.setItem(KEY, 'purple')
    const { result } = renderHook(() => useThemeMode(), { wrapper })
    expect(result.current.mode).toBe('system')
  })

  it('remembers a light/dark choice, and forgets it for system', () => {
    const { result } = renderHook(() => useThemeMode(), { wrapper })

    act(() => result.current.setMode('dark'))
    expect(result.current.mode).toBe('dark')
    expect(localStorage.getItem(KEY)).toBe('dark')

    act(() => result.current.setMode('system'))
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('still works when storage throws (private mode, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { result } = renderHook(() => useThemeMode(), { wrapper })
    expect(result.current.mode).toBe('system')

    act(() => result.current.setMode('light'))

    expect(result.current.mode).toBe('light') // applies for this visit
  })

  it('useThemeMode needs the provider', () => {
    expect(() => renderHook(() => useThemeMode())).toThrow('useThemeMode must be used inside <ThemeModeProvider>')
  })
})

describe('useThemeModeItems', () => {
  it('offers Light / Dark / Automatic, ticks the current one, and switches on click', () => {
    const { result } = renderHook(() => ({ items: useThemeModeItems(), mode: useThemeMode().mode }), { wrapper })

    expect(result.current.items.map((i) => i.label)).toEqual(['Light', 'Dark', 'Automatic'])
    expect(result.current.items.map((i) => Boolean(i.endContent))).toEqual([false, false, true])

    act(() => result.current.items[1].onClick!({} as never))

    expect(result.current.mode).toBe('dark')
    expect(result.current.items.map((i) => Boolean(i.endContent))).toEqual([false, true, false])
  })
})
