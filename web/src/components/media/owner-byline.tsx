import { Avatar } from '@astryxdesign/core/Avatar'
import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { profilePath } from '@/lib/links'
import type { UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'

type Props = {
  owner: UserSummary
  /** Their @username after the name — wider screens only (on phones the name, which
   *  links to their profile, is enough beside the cover). */
  hasUsername?: boolean
  /** More on the same line: "Sam · 8 tracks · 29 min". */
  detail?: string
}

// Who made it, in a detail page's header: their photo and name, linking to their profile.
export function OwnerByline({ owner, hasUsername = false, detail }: Props) {
  const isMobile = useIsMobile()
  const name = nameOf(owner)
  return (
    <HStack gap={2} vAlign="center">
      <Avatar size="xsm" src={owner.imageUrl ?? undefined} name={name} tooltip={false} />
      <Text type="body" maxLines={1}>
        <Link href={profilePath(owner.username)} color="primary" weight="semibold">
          {name}
        </Link>
        {hasUsername && !isMobile && (
          <Text type="supporting" color="secondary">
            {' '}@{owner.username}
          </Text>
        )}
        {detail && (
          <Text type="supporting" color="secondary">
            {' '}· {detail}
          </Text>
        )}
      </Text>
    </HStack>
  )
}
