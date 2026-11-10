import { createContext, useContext } from 'react'

export type TextSize = 'small' | 'default' | 'large' | 'xlarge'
export type Density = 'comfortable' | 'compact'

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  xlarge: 'Larger',
}
export const DENSITY_LABELS: Record<Density, string> = { comfortable: 'Comfortable', compact: 'Compact' }

export type DisplayPrefs = {
  textSize: TextSize
  density: Density
  setTextSize: (size: TextSize) => void
  setDensity: (density: Density) => void
}

const DEFAULTS: DisplayPrefs = {
  textSize: 'default',
  density: 'comfortable',
  setTextSize: () => {},
  setDensity: () => {},
}

export const DisplayPrefsContext = createContext<DisplayPrefs>(DEFAULTS)

/** Text size + density (display-prefs.tsx). Outside the provider (e.g. a lone component in a
 *  test) it reads as the defaults, so rows don't need a provider to render. */
export function useDisplayPrefs(): DisplayPrefs {
  return useContext(DisplayPrefsContext)
}

export const useIsCompactDensity = () => useDisplayPrefs().density === 'compact'
