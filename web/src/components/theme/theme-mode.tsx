import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeModeContext } from './use-theme-mode'

// Light / dark / automatic (follow the OS). A per-device preference, so it lives in
// localStorage; every access is guarded because storage can throw (private mode,
// blocked site data) and the app must still render with the default.
export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'melomelo.theme-mode'

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // the choice still applies for this visit
    }
  }, [])

  // The page canvas outside the app follows the choice too (app/global.css)
  useEffect(() => {
    document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode
  }, [mode])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>
}
