import { Badge } from '@astryxdesign/core/Badge'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Popover } from '@astryxdesign/core/Popover'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { BellIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { useActivityUnread, useRefreshOnNewShares } from '../api/activity'
import { ActivityList } from './activity-list'
import './activity.css'

// The bell in the header, with the unread count as a badge. On phones it's a link to the
// Activity screen (/activity), like every other screen there; on wider screens it opens
// the list in a popover, which marks everything seen (rows that were new keep their dot
// until it closes) and closes itself when you follow anything in it.
export function NotificationsPopover() {
  const isMobile = useIsMobile()
  const { activity, seenAt, badge, markSeen } = useActivityUnread()
  // Open on the page it was opened on: following a row (or any link in the pane) changes
  // the page, which closes it
  const { pathname } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const isOpen = openOn === pathname
  const [seenAtOpen, setSeenAtOpen] = useState<number | null>(null)
  // Polling for new shares runs wherever the bell is (it's always in the header)
  useRefreshOnNewShares(activity.data?.pages[0]?.items)

  const bell = (
    <span className="mm-badge-anchor">
      <IconButton
        label={badge ? `Activity, ${badge} new` : 'Activity'}
        tooltip="Activity"
        variant="ghost"
        // a touch bigger on phones, matching the rest of the phone header
        size={isMobile ? 'lg' : undefined}
        icon={<Icon icon={BellIcon} />}
        href={isMobile ? '/activity' : undefined}
      />
      {badge && (
        <span className="mm-badge-anchor-badge" aria-hidden="true">
          <Badge variant="error" label={badge} />
        </span>
      )}
    </span>
  )

  if (isMobile) return bell

  const handleOpenChange = (open: boolean) => {
    setOpenOn(open ? pathname : null)
    if (open) {
      setSeenAtOpen(seenAt)
      markSeen()
    }
  }

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      placement="below"
      alignment="end"
      width={380}
      padding={0}
      label="Activity"
      content={
        <VStack>
          <HStack padding={3} vAlign="center">
            <Text type="label" weight="semibold">
              Activity
            </Text>
          </HStack>
          <Divider />
          <div className="mm-activity-scroll">
            <VStack padding={1}>
              <ActivityList activity={activity} seenAt={seenAtOpen ?? seenAt} />
            </VStack>
          </div>
        </VStack>
      }
    >
      {bell}
    </Popover>
  )
}
