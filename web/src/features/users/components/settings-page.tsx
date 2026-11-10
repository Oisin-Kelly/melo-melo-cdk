import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { VStack } from '@astryxdesign/core/VStack'
import { ChevronRightIcon, KeyIcon, PencilSquareIcon, ShieldCheckIcon, SunIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { DENSITY_LABELS, TEXT_SIZE_LABELS, useDisplayPrefs } from '@/components/theme/use-display-prefs'
import { MODE_LABELS, useThemeMode } from '@/components/theme/use-theme-mode'
import { SignOutDialog } from './sign-out-dialog'

// The phone Settings tab: a list that drills into each screen (edit profile, change
// password, two-step verification, appearance), with sign out at the end. Desktop has the
// two-pane settings layout instead (app/layouts/settings-layout.tsx).
export function SettingsPage() {
  const { mode } = useThemeMode()
  const { textSize, density } = useDisplayPrefs()
  // "Automatic", plus whatever else isn't the default ("Automatic · Large text · Compact")
  const appearance = [
    MODE_LABELS[mode],
    textSize !== 'default' && `${TEXT_SIZE_LABELS[textSize]} text`,
    density !== 'comfortable' && DENSITY_LABELS[density],
  ]
    .filter(Boolean)
    .join(' · ')
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <VStack gap={6}>
      <Heading level={1}>Settings</Heading>

      <List hasDividers={false} edgeCompensation="inline">
        <ListItem
          href="/settings/profile"
          startContent={<Icon icon={PencilSquareIcon} color="secondary" />}
          label="Edit profile"
          description="Photo, name, bio and privacy"
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
        />
        <ListItem
          href="/settings/password"
          startContent={<Icon icon={KeyIcon} color="secondary" />}
          label="Change password"
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
        />
        <ListItem
          href="/settings/two-step"
          startContent={<Icon icon={ShieldCheckIcon} color="secondary" />}
          label="Two-step verification"
          description="A code from an app when you sign in"
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
        />
        <ListItem
          href="/settings/appearance"
          startContent={<Icon icon={SunIcon} color="secondary" />}
          label="Appearance"
          description={appearance}
          endContent={<Icon icon={ChevronRightIcon} size="sm" color="secondary" />}
        />
      </List>

      <Button label="Sign out" variant="destructive" width="100%" onClick={() => setIsSigningOut(true)} />
      <SignOutDialog isOpen={isSigningOut} onOpenChange={setIsSigningOut} />
    </VStack>
  )
}
