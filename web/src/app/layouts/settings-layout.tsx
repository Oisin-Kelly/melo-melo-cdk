import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { Icon } from '@astryxdesign/core/Icon'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { VStack } from '@astryxdesign/core/VStack'
import {
  ArrowRightStartOnRectangleIcon,
  KeyIcon,
  ShieldCheckIcon,
  SunIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { EditProfilePage } from '@/features/users/components/edit-profile-page'
import { SettingsPage } from '@/features/users/components/settings-page'
import { SignOutDialog } from '@/features/users/components/sign-out-dialog'
import { useIsMobile } from '@/hooks/use-is-mobile'
import './settings-layout.css'

const SECTIONS = [
  { label: 'Profile', href: '/settings/profile', icon: UserCircleIcon },
  { label: 'Password', href: '/settings/password', icon: KeyIcon },
  { label: 'Two-step verification', href: '/settings/two-step', icon: ShieldCheckIcon },
  { label: 'Appearance', href: '/settings/appearance', icon: SunIcon },
]

// /settings on desktop, after Astryx's settings-sidebar template: the content area edge to
// edge, the template's section list on the left and the chosen section beside it, every
// section its own URL (so links, Back and the avatar menu land on the right one). Phones keep
// the drill-down: /settings is the list (SettingsPage) and each section a full screen with a
// back button.
export function SettingsLayout() {
  const isMobile = useIsMobile()
  const { pathname } = useLocation()
  const [isSigningOut, setIsSigningOut] = useState(false)

  if (isMobile) return <Outlet />

  // /settings itself shows Profile (see SettingsIndex)
  const isAtIndex = pathname.replace(/\/$/, '') === '/settings'

  return (
    <div className="mm-settings">
      <Layout
        height="fill"
        start={
          <LayoutPanel hasDivider padding={0}>
            <VStack gap={4} className="mm-settings-nav">
              <Heading level={2} className="mm-settings-nav-title">
                Settings
              </Heading>
              <List density="spacious">
                {SECTIONS.map((section) => (
                  <ListItem
                    key={section.href}
                    href={section.href}
                    label={section.label}
                    startContent={<Icon icon={section.icon} />}
                    isSelected={pathname.startsWith(section.href) || (isAtIndex && section.href === '/settings/profile')}
                  />
                ))}
              </List>
              <Divider />
              <List density="spacious">
                <ListItem
                  label="Sign out"
                  startContent={<Icon icon={ArrowRightStartOnRectangleIcon} />}
                  onClick={() => setIsSigningOut(true)}
                />
              </List>
            </VStack>
          </LayoutPanel>
        }
        content={
          <LayoutContent padding={8}>
            <Outlet />
          </LayoutContent>
        }
      />
      <SignOutDialog isOpen={isSigningOut} onOpenChange={setIsSigningOut} />
    </div>
  )
}

/**
 * /settings itself: the list on phones; on desktop the first section, Profile, shown in place
 * rather than redirected — a redirect would replace /settings in history, so if the window
 * then narrows to phone size, Back from a section would skip the Settings list.
 */
export function SettingsIndex() {
  const isMobile = useIsMobile()
  return isMobile ? <SettingsPage /> : <EditProfilePage />
}
