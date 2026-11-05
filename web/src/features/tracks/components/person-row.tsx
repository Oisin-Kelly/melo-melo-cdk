import { Avatar } from '@astryxdesign/core/Avatar'
import { Item } from '@astryxdesign/core/Item'
import type { ReactNode } from 'react'
import { profilePath } from '@/lib/links'
import type { UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'

// A person in an owner list (shared with, liked by): avatar, name, when — a link to
// their profile
export function PersonRow({ user, children }: { user: UserSummary; children: ReactNode }) {
  return (
    <Item
      href={profilePath(user.username)}
      startContent={<Avatar size={32} src={user.imageUrl ?? undefined} name={nameOf(user)} tooltip={false} />}
      label={nameOf(user)}
      description={children}
    />
  )
}
