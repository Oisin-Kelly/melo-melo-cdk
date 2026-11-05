import { type DropdownMenuItemData } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { CheckIcon, ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { type ThemeMode } from './theme-mode'
import { useThemeMode } from './use-theme-mode'

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { mode: 'light', label: 'Light', icon: SunIcon },
  { mode: 'dark', label: 'Dark', icon: MoonIcon },
  { mode: 'system', label: 'Automatic', icon: ComputerDesktopIcon },
]

// Light / dark / automatic as menu items (the current one ticked), for the header's
// moon menu and the phone account menu's Appearance submenu.
export function useThemeModeItems(): DropdownMenuItemData[] {
  const { mode, setMode } = useThemeMode()
  return OPTIONS.map((option) => ({
    label: option.label,
    icon: option.icon,
    endContent: option.mode === mode ? <Icon icon={CheckIcon} size="sm" color="accent" /> : undefined,
    onClick: () => setMode(option.mode),
  }))
}
