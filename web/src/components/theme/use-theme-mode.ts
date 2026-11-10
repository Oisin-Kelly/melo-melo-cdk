import { createContext, useContext } from 'react'
import type { ThemeMode } from './theme-mode'

export type ThemeModeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void }

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null)

/** How each mode is named wherever it's shown (Settings, the Appearance screen). */
export const MODE_LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'Automatic' }

export function useThemeMode(): ThemeModeContextValue {
  const value = useContext(ThemeModeContext)
  if (!value) throw new Error('useThemeMode must be used inside <ThemeModeProvider>')
  return value
}
