import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { tint } from '@/components/media/tint'
import { profilePath } from '@/lib/links'
import type { UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import '@/components/lists/lists.css'
import './people.css'

// One person in a people screen (followers, shared with, liked by), SoundCloud-style: their
// photo as a big circle filling the column — or, without one, a soft gradient in their
// colour — then their name, @username and one line of context ("Shared 2 hours ago").
// No card around it; a background only appears on hover. The whole tile opens their profile.
export function PersonCard({ user, detail }: { user: UserSummary; detail?: ReactNode }) {
  return (
    <RouterLink to={profilePath(user.username)} className="mm-person" style={tint(user.imageBgColor)}>
      <span className="mm-person-photo">{user.imageUrl && <img src={user.imageUrl} alt="" loading="lazy" />}</span>
      <span className="mm-person-text">
        <Text type="body" weight="semibold" maxLines={1}>
          {nameOf(user)}
        </Text>
        <Text type="supporting" color="secondary" maxLines={1}>
          @{user.username}
        </Text>
        {detail && (
          <Text type="supporting" color="secondary" maxLines={1}>
            {detail}
          </Text>
        )}
      </span>
    </RouterLink>
  )
}

/** People in a grid: two across on phones, as many as fit on wider screens. */
export function PersonGrid({ children }: { children: ReactNode }) {
  return <div className="mm-card-grid">{children}</div>
}

// The search box at the top of a people screen
export function PeopleSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextInput
      label="Search people"
      isLabelHidden
      placeholder="Search by name or @username"
      startIcon={MagnifyingGlassIcon}
      value={value}
      onChange={onChange}
      hasClear
    />
  )
}
