import { LinkProvider } from '@astryxdesign/core/Link'
import type { AnchorHTMLAttributes, Ref } from 'react'
import { Link as RouterLink, Outlet } from 'react-router'

type RouterAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string
  ref?: Ref<HTMLAnchorElement>
}

// Every Astryx link (Link, Button href, SideNavItem, menu rows, Avatar href) renders
// through react-router's Link, so in-app navigation never reloads the page.
export function RouterAnchor({ href = '', ...rest }: RouterAnchorProps) {
  return <RouterLink to={href} {...rest} />
}

export function RootLayout() {
  return (
    <LinkProvider component={RouterAnchor}>
      <Outlet />
    </LinkProvider>
  )
}
