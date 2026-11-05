import { Avatar } from '@astryxdesign/core/Avatar'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath } from '@/lib/links'
import { useMe } from '@/lib/me'
import { nameOf } from '@/types/user'

// Phones: your avatar at the top right, a plain link to your profile (no menu — the
// account controls live on the Settings tab).
export function ProfileButton() {
  const username = useUsername()
  const me = useMe()

  if (me.isPending) return <Skeleton width={36} height={36} radius="rounded" />

  const name = me.data ? nameOf(me.data) : username
  return (
    <Avatar
      href={profilePath(username)}
      src={me.data?.imageUrl ?? undefined}
      name={name}
      alt={`${name} — your profile`}
      tooltip={false}
      size={36}
    />
  )
}
