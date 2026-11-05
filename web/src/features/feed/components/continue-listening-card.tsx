import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { Text } from '@astryxdesign/core/Text'
import { StackItem } from '@astryxdesign/core/Stack'
import { VStack } from '@astryxdesign/core/VStack'
import { PlayIcon } from '@heroicons/react/24/solid'
import { CoverArt } from '@/components/media/cover-art'
import { nameOf } from '@/types/user'
import { formatLength } from '@/utils/format'
import { useProgress, type ProgressEntry } from '../api/feed'

type Props = {
  /** Wired up once playback exists; until then Resume is disabled. */
  onPlay?: (progress: ProgressEntry) => void
}

// "Continue listening" from GET /me/progress. Hidden when there's nothing to resume
// (204) and on any error: it's a convenience, never core content.
export function ContinueListeningCard({ onPlay }: Props) {
  const progress = useProgress()

  // Nothing while loading either: it's optional, and a placeholder would just jump away
  if (!progress.data) return null

  const { track, positionSeconds } = progress.data
  const remaining = Math.max(0, track.duration - positionSeconds)

  return (
    <Card variant="muted" padding={3}>
      <HStack gap={3} vAlign="center">
        <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="sm" />
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary" weight="semibold">
              Continue listening
            </Text>
            <Text weight="bold" maxLines={1}>
              {track.name}
            </Text>
            <Text type="supporting" color="secondary" maxLines={1}>
              {nameOf(track.owner)} · {formatLength(remaining)} left
            </Text>
          </VStack>
        </StackItem>
        <Button
          label="Resume"
          variant="primary"
          icon={<Icon icon={PlayIcon} />}
          isDisabled={!onPlay}
          tooltip={onPlay ? undefined : 'Playback coming soon'}
          onClick={() => onPlay?.(progress.data!)}
        />
      </HStack>
    </Card>
  )
}
