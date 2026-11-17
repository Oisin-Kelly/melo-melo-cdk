import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { TopNav } from '@astryxdesign/core/TopNav'
import {
  AdjustmentsHorizontalIcon,
  ArrowUpTrayIcon,
  HeartIcon,
  HomeIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import {
  AdjustmentsHorizontalIcon as AdjustmentsHorizontalSolid,
  HeartIcon as HeartSolid,
  HomeIcon as HomeSolid,
  RectangleStackIcon as RectangleStackSolid,
  UserIcon as UserSolid,
} from '@heroicons/react/24/solid'
import { Outlet, useLocation } from 'react-router'
import { Wordmark } from '@/components/brand/wordmark'
import { MiniPlayer } from '@/components/player/mini-player'
import { NowPlayingBar } from '@/components/player/now-playing-bar'
import { PlayerProvider } from '@/components/player/player-provider'
import { AlbumEditorProvider } from '@/features/albums/components/album-editor'
import { UploadProvider } from '@/features/tracks/components/upload-dialog'
import { useUpload } from '@/features/tracks/components/upload-context'
import { ThemeModeMenu } from '@/components/theme/theme-mode-menu'
import { NotificationsPopover } from '@/features/activity/components/notifications-popover'
import { GlobalSearch } from '@/features/search/components/global-search'
import { SidebarPlaylists } from '@/features/playlists/components/sidebar-playlists'
import { ProfileButton } from '@/features/users/components/profile-button'
import { UserMenu } from '@/features/users/components/user-menu'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'
import { BottomTabs } from './bottom-tabs'
import { useLogoScrollScale } from './use-logo-scroll-scale'
import './app-shell.css'

// The signed-in frame (from the shell-nav template). Desktop: header across the top
// (logo, search, upload, bell, theme, avatar), nav on the left. Phones (below md):
// no drawer — a slim header (bell, centred logo, upload + your avatar linking to your
// profile) and a bottom tab bar, the tab bar sitting below AppShell in a full-height
// column so it never covers content. Once something has played, the player joins that
// column: a bar along the bottom on desktop, a mini bar above the tabs on phones. The one
// player sits above the layout switch, so resizing never interrupts the music.
export function AppLayout() {
  const isMobile = useIsMobile()
  // Upload is a dialog over whatever page you're on, open-able from anywhere (UploadProvider)
  return (
    <PlayerProvider>
      <UploadProvider>
        <AlbumEditorProvider>{isMobile ? <PhoneLayout /> : <DesktopLayout />}</AlbumEditorProvider>
      </UploadProvider>
    </PlayerProvider>
  )
}

function DesktopLayout() {
  const { pathname } = useLocation()
  const openUpload = useUpload().open
  const username = useUsername()
  useLogoScrollScale()

  const profile = profilePath(username)
  const main = [
    { label: 'Home', href: '/', icon: HomeIcon, selectedIcon: HomeSolid, isCurrent: pathname === '/' },
    {
      label: 'Library',
      href: '/library',
      icon: RectangleStackIcon,
      selectedIcon: RectangleStackSolid,
      isCurrent: pathname.startsWith('/library'),
    },
    { label: 'Liked tracks', href: '/liked', icon: HeartIcon, selectedIcon: HeartSolid, isCurrent: pathname.startsWith('/liked') },
    // The tables of your tracks, albums and playlists — only those exact paths;
    // /tracks/{id} and the like are some item's page
    {
      label: 'Manage',
      href: '/tracks',
      icon: AdjustmentsHorizontalIcon,
      selectedIcon: AdjustmentsHorizontalSolid,
      isCurrent: ['/tracks', '/albums', '/playlists'].includes(pathname),
    },
    {
      label: 'Profile',
      href: profile,
      icon: UserIcon,
      selectedIcon: UserSolid,
      // Just the profile and its follow lists — your tracks, albums and playlists live under
      // the same /{username}/ prefix but aren't "Profile"
      isCurrent: [profile, `${profile}/followers`, `${profile}/following`].includes(pathname),
    },
  ]

  return (
    <div className="mm-app-frame">
      <AppShell
        height="fill"
        variant="section"
        // = --mm-page-pad in app-shell.css
        contentPadding={8}
        topNav={
          <TopNav
            label="MeloMelo"
            heading={<Wordmark href="/" />}
            centerContent={<GlobalSearch />}
            endContent={
              <HStack gap={2} vAlign="center">
                <Button
                  label="Upload track"
                  onClick={openUpload}
                  variant="secondary"
                  size="sm"
                  icon={<Icon icon={ArrowUpTrayIcon} />}
                />
                <NotificationsPopover />
                <ThemeModeMenu />
                <UserMenu />
              </HStack>
            }
          />
        }
        sideNav={
          <SideNav>
            <SideNavSection title="Menu" isHeaderHidden>
              {main.map((item) => (
                <SideNavItem
                  key={item.label}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  selectedIcon={item.selectedIcon}
                  isSelected={item.isCurrent}
                />
              ))}
            </SideNavSection>
            <SidebarPlaylists />
          </SideNav>
        }
      >
        <Outlet />
      </AppShell>
      <NowPlayingBar />
    </div>
  )
}

function PhoneLayout() {
  useLogoScrollScale()
  const openUpload = useUpload().open
  return (
    <div className="mm-app-frame">
      <AppShell
        height="fill"
        variant="section"
        // = --mm-page-pad in app-shell.css
        contentPadding={5}
        mobileNav={false}
        topNav={
          <TopNav
            label="MeloMelo"
            heading={<NotificationsPopover />}
            centerContent={<Wordmark href="/" />}
            endContent={
              <HStack gap={2} vAlign="center">
                <IconButton
                  label="Upload track"
                  onClick={openUpload}
                  variant="ghost"
                  size="lg"
                  icon={<Icon icon={ArrowUpTrayIcon} />}
                />
                <ProfileButton />
              </HStack>
            }
          />
        }
      >
        <Outlet />
      </AppShell>
      <MiniPlayer />
      <BottomTabs />
    </div>
  )
}
