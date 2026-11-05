import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { MoonIcon } from '@heroicons/react/24/outline'
import { useThemeModeItems } from './use-theme-mode-items'

// The moon button in the header: pick light, dark, or follow the device.
export function ThemeModeMenu() {
  const items = useThemeModeItems()

  return (
    <DropdownMenu
      hasChevron={false}
      alignment="end"
      menuWidth={200}
      renderTrigger={(props) => (
        <IconButton {...props} label="Appearance" tooltip="Appearance" variant="ghost" icon={<Icon icon={MoonIcon} />} />
      )}
      items={items}
    />
  )
}
