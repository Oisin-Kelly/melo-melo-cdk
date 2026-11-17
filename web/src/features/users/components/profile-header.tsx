import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { CheckIcon, EllipsisHorizontalIcon, LinkIcon, PencilIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { Fragment, type ReactNode } from 'react'
import { sileo } from 'sileo'
import { CollectionHeader } from '@/components/media/collection-header'
import { useIsCompact } from '@/hooks/use-is-compact'
import { useIsNarrow } from '@/hooks/use-is-narrow'
import { followListPath, profilePath } from '@/lib/links'
import { nameOf, type User } from '@/types/user'
import { useFollowStatus, useToggleFollow } from '@/lib/people'

// The top of a profile: the same header as albums, playlists and tracks — the round
// photo where the cover goes, then PROFILE, the name, @username · location, their
// numbers, and Follow (or Edit profile on your own) with ⋯. On phones a smaller photo
// sits beside the name, @username, location and numbers (no PROFILE label), with only
// the buttons underneath. The bio sits below the header, like a description.
export function ProfileHeader({ user, isMe }: { user: User; isMe: boolean }) {
  const isCompact = useIsCompact()
  const isNarrow = useIsNarrow()
  const name = nameOf(user)
  const location = [user.city, user.country].filter(Boolean).join(', ')
  // Phones: the stats are small lines beside the photo
  const statType = isCompact ? 'supporting' : 'body'

  const stats = [
    <Stat
      key="followers"
      count={user.followerCount}
      label={user.followerCount === 1 ? 'follower' : 'followers'}
      href={followListPath(user.username, 'followers')}
      type={statType}
    />,
    <Stat
      key="following"
      count={user.followingCount}
      label="following"
      href={followListPath(user.username, 'following')}
      type={statType}
    />,
    !isMe && user.sharedWithYouCount !== undefined && (
      <Stat
        key="shared"
        count={user.sharedWithYouCount}
        // Phones: short enough to stay on one line beside the photo
        label={isCompact ? 'shared with you' : `${user.sharedWithYouCount === 1 ? 'track' : 'tracks'} shared with you`}
        type={statType}
      />
    ),
  ].filter(Boolean)

  return (
    <CollectionHeader
      kind="Profile"
      title={name}
      imageUrl={user.imageUrl}
      imageBgColor={user.imageBgColor}
      // The photo in the cover's place, at the nearest Avatar size to the cover's
      cover={
        <span className="mm-photo">
          <Avatar src={user.imageUrl ?? undefined} name={name} alt="" size={isCompact ? (isNarrow ? 96 : 128) : 180} tooltip={false} />
        </span>
      }
      backFallback="/"
      isCompactBeside
      // Phones: the location on its own line (joined to the username it wrapped mid-place)
      byline={
        isCompact ? (
          <>
            <Text type="supporting" color="secondary" maxLines={1}>
              @{user.username}
            </Text>
            {location && (
              <Text type="supporting" color="secondary" maxLines={1}>
                {location}
              </Text>
            )}
          </>
        ) : (
          <Text type="body" color="secondary" maxLines={1}>
            @{user.username}
            {location && ` · ${location}`}
          </Text>
        )
      }
      // Phones: followers · following on one line, what's shared with you on its own
      meta={
        isCompact ? (
          <>
            <Text type="supporting" color="secondary">
              {joined(stats.slice(0, 2))}
            </Text>
            {stats[2] && (
              <Text type="supporting" color="secondary">
                {stats[2]}
              </Text>
            )}
          </>
        ) : (
          joined(stats)
        )
      }
      actions={
        <>
          {/* Phones: the main action fills the row, ⋯ at its end */}
          <StackItem size={isCompact ? 'fill' : undefined}>
            {isMe ? (
              <Button
                label="Edit profile"
                variant="secondary"
                href="/settings/profile"
                icon={<Icon icon={PencilIcon} />}
                width={isCompact ? '100%' : undefined}
              />
            ) : (
              <FollowButton username={user.username} name={name} width={isCompact ? '100%' : undefined} />
            )}
          </StackItem>
          <DropdownMenu
            renderTrigger={(props) => (
              <IconButton {...props} label="More profile options" variant="ghost" icon={<Icon icon={EllipsisHorizontalIcon} />} />
            )}
            items={[
              {
                label: 'Copy profile link',
                icon: LinkIcon,
                onClick: () => {
                  navigator.clipboard
                    .writeText(`${window.location.origin}${profilePath(user.username)}`)
                    .then(() => sileo.success({ title: 'Link copied' }))
                    .catch(() => sileo.error({ title: "Couldn't copy the link" }))
                },
              },
            ]}
          />
        </>
      }
    />
  )
}

// Stats separated by " · "
function joined(stats: ReactNode[]) {
  return stats.map((stat, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {stat}
    </Fragment>
  ))
}

// "24 followers": the number in the primary colour; a link when the list can be seen,
// otherwise (a private list) a tooltip saying so
function Stat({
  count,
  label,
  href,
  type = 'body',
}: {
  count: number
  label: string
  href?: string
  type?: 'body' | 'supporting'
}) {
  const content = (
    <>
      <Text type={type} weight="semibold" color="primary">
        {count.toLocaleString()}
      </Text>{' '}
      {label}
    </>
  )
  if (href) {
    return (
      <Link href={href} type={type} color="secondary" className="mm-inline-link mm-stat">
        {content}
      </Link>
    )
  }
  return (
    <Text type={type} color="secondary" className="mm-stat">
      {content}
    </Text>
  )
}

// Follow / Following. Optimistic, so the button flips straight away; tapping
// Following unfollows.
function FollowButton({ username, name, width }: { username: string; name: string; width?: '100%' }) {
  const status = useFollowStatus(username, true)
  const toggle = useToggleFollow(username)

  if (status.isPending) return <Button label="Follow" variant="primary" isLoading isDisabled width={width} />

  return status.data ? (
    <Button
      label="Following"
      variant="secondary"
      icon={<Icon icon={CheckIcon} />}
      tooltip={`Unfollow ${name}`}
      width={width}
      onClick={() => toggle.mutate(false)}
    />
  ) : (
    <Button
      label="Follow"
      variant="primary"
      icon={<Icon icon={UserPlusIcon} />}
      width={width}
      onClick={() => toggle.mutate(true)}
    />
  )
}
