import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DisplayPrefsContext, type Density, type TextSize } from './use-display-prefs'
import './display-prefs.css'

// Text size and density: per-device preferences like light/dark (theme-mode.tsx), so they
// live in localStorage with every access guarded (storage can throw in private mode or with
// blocked site data — the app still renders with the defaults). Each is written to <html> as
// a data attribute (absent = default) that display-prefs.css reads: text size scales the
// theme's font-size tokens; density is also read by components through useDisplayPrefs.

const TEXT_SIZE_KEY = 'melomelo.text-size'
const DENSITY_KEY = 'melomelo.density'
const TEXT_SIZES: TextSize[] = ['small', 'default', 'large', 'xlarge']

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string, isDefault: boolean) {
  try {
    if (isDefault) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // the choice still applies for this visit
  }
}

export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>(() => read(TEXT_SIZE_KEY, TEXT_SIZES, 'default'))
  const [density, setDensityState] = useState<Density>(() => read(DENSITY_KEY, ['comfortable', 'compact'], 'comfortable'))

  const setTextSize = useCallback((next: TextSize) => {
    setTextSizeState(next)
    write(TEXT_SIZE_KEY, next, next === 'default')
  }, [])
  const setDensity = useCallback((next: Density) => {
    setDensityState(next)
    write(DENSITY_KEY, next, next === 'comfortable')
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (textSize === 'default') delete root.dataset.mmTextSize
    else root.dataset.mmTextSize = textSize
    if (density === 'comfortable') delete root.dataset.mmDensity
    else root.dataset.mmDensity = density
  }, [textSize, density])

  const value = useMemo(() => ({ textSize, density, setTextSize, setDensity }), [textSize, density, setTextSize, setDensity])
  return <DisplayPrefsContext.Provider value={value}>{children}</DisplayPrefsContext.Provider>
}
