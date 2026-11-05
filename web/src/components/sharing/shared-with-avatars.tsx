import { Avatar } from '@astryxdesign/core/Avatar'
import { AvatarGroup, AvatarGroupOverflow } from '@astryxdesign/core/AvatarGroup'
import type { Recipient } from '@/types/api'
import { nameOf } from '@/types/user'
import './sharing.css'


type Props = {
  /** Who it's shared with, newest first (an owner-only recipients query). */
  recipients: Recipient[] | undefined
  /** Opens the share dialog to manage access. */
  onClick: () => void
}

// Owner-only: the people something is shared with, as overlapping avatars (up to four, then
// "+N"); each shows their name on hover (the group's label says it manages access), and the
// group opens the share dialog. Nothing at all until someone has it. Not shown on phones —
// the headers leave it out there (see SharedWithCorner on the track and album pages).
const VISIBLE = 4

export function SharedWithAvatars({ recipients, onClick }: Props) {
  if (!recipients?.length) return null
  const shown = recipients.slice(0, VISIBLE)
  const label = `Shared with ${recipients.length === 1 ? nameOf(recipients[0].user) : `${recipients.length} people`} — manage access`

  return (
    <button type="button" className="mm-shared-with" aria-label={label} onClick={onClick}>
      <AvatarGroup size={32} aria-label={label}>
        {shown.map((recipient) => (
          <Avatar
            key={recipient.user.username}
            src={recipient.user.imageUrl ?? undefined}
            name={nameOf(recipient.user)}
            tooltip
          />
        ))}
        {recipients.length > VISIBLE && <AvatarGroupOverflow count={recipients.length - VISIBLE} />}
      </AvatarGroup>
    </button>
  )
}
