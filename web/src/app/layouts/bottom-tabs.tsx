import { Icon } from '@astryxdesign/core/Icon'
import { Cog6ToothIcon, HomeIcon, MagnifyingGlassIcon, RectangleStackIcon } from '@heroicons/react/24/outline'
import {
  Cog6ToothIcon as Cog6ToothSolid,
  HomeIcon as HomeSolid,
  MagnifyingGlassIcon as MagnifyingGlassSolid,
  RectangleStackIcon as RectangleStackSolid,
} from '@heroicons/react/24/solid'
import { Link, useLocation } from 'react-router'
import { useUsername } from '@/lib/auth/auth-context'
import './bottom-tabs.css'

// The phone tab bar (Astryx has no bottom navigation; its TabList is an in-page strip).
// Route navigation, so it's a <nav> of links with aria-current — not role="tablist",
// which is for swapping panels in place. Like the side nav, the icon fills in when its
// tab is current.
export function BottomTabs() {
  const { pathname } = useLocation()
  const me = useUsername()

  const tabs = [
    { label: 'Home', href: '/', icon: HomeIcon, selectedIcon: HomeSolid, isCurrent: pathname === '/' },
    {
      label: 'Search',
      href: '/search',
      icon: MagnifyingGlassIcon,
      selectedIcon: MagnifyingGlassSolid,
      isCurrent: pathname.startsWith('/search'),
    },
    {
      label: 'Library',
      href: '/library',
      icon: RectangleStackIcon,
      selectedIcon: RectangleStackSolid,
      // Liked and your playlists are reached from Library on a phone
      isCurrent: ['/library', '/liked', '/playlists/', `/${me}/playlists/`].some((prefix) => pathname.startsWith(prefix)),
    },
    // Your profile is the avatar in the header
    {
      label: 'Settings',
      href: '/settings',
      icon: Cog6ToothIcon,
      selectedIcon: Cog6ToothSolid,
      isCurrent: pathname.startsWith('/settings'),
    },
  ]

  return (
    <nav className="mm-tabs" aria-label="Main">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          to={tab.href}
          className="mm-tab"
          aria-current={tab.isCurrent ? 'page' : undefined}
          draggable={false}
        >
          <Icon icon={tab.isCurrent ? tab.selectedIcon : tab.icon} size="lg" color="inherit" />
          <span className="mm-tab-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}
