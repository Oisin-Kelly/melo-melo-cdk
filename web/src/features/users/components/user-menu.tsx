import { Avatar } from '@astryxdesign/core/Avatar'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import {
  ArrowRightStartOnRectangleIcon,
  KeyIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'
import { useMe } from '@/lib/me'
import { nameOf } from '@/types/user'
import { SignOutDialog } from './sign-out-dialog'

// The avatar at the top right: who you're signed in as (name, @username — opens your
// profile), edit your profile and account, sign out (after a confirm).
export function UserMenu() {
  const username = useUsername()
  const me = useMe()
  const [isSigningOut, setIsSigningOut] = useState(false)

  if (me.isPending) return <Skeleton width={36} height={36} radius="rounded" />

  const name = me.data ? nameOf(me.data) : username

  return (
    <>
      <DropdownMenu
        hasChevron={false}
        alignment="end"
        menuWidth={220}
        renderTrigger={(props) => (
          <Avatar
            {...props}
            src={me.data?.imageUrl ?? undefined}
            name={name}
            alt={`${name} — account menu`}
            tooltip={false}
            size="md"
          />
        )}
        items={[
          // Who you're signed in as, opening your profile
          {
            id: 'me',
            icon: <Avatar src={me.data?.imageUrl ?? undefined} name={name} tooltip={false} size="sm" />,
            label: name,
            description: `@${username}`,
            href: profilePath(username),
          },
          { type: 'divider' },
          { label: 'Edit profile', icon: PencilSquareIcon, href: '/settings/profile' },
          { label: 'Change password', icon: KeyIcon, href: '/settings/password' },
          { label: 'Two-step verification', icon: ShieldCheckIcon, href: '/settings/two-step' },
          { type: 'divider' },
          { label: 'Sign out', icon: ArrowRightStartOnRectangleIcon, onClick: () => setIsSigningOut(true) },
        ]}
      />
      <SignOutDialog isOpen={isSigningOut} onOpenChange={setIsSigningOut} />
    </>
  )
}
