import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ChevronRightIcon, KeyIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import type { ThemeMode } from '@/components/theme/theme-mode'
import { useThemeMode } from '@/components/theme/use-theme-mode'
import { SignOutDialog } from './sign-out-dialog'

// The phone Settings tab (also /settings on desktop, where the avatar and moon menus
// cover the same ground): edit profile, change password, appearance, sign out.
export function SettingsPage() {
  const { mode, setMode } = useThemeMode()
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
      </List>

      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Appearance
        </Text>
        <SegmentedControl label="Appearance" value={mode} onChange={(value) => setMode(value as ThemeMode)}>
          <SegmentedControlItem value="light" label="Light" />
          <SegmentedControlItem value="dark" label="Dark" />
          <SegmentedControlItem value="system" label="Automatic" />
        </SegmentedControl>
      </VStack>

      <Button label="Sign out" variant="destructive" width="100%" onClick={() => setIsSigningOut(true)} />
      <SignOutDialog isOpen={isSigningOut} onOpenChange={setIsSigningOut} />
    </VStack>
  )
}
