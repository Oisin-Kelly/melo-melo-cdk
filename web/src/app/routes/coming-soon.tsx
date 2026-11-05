import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { VStack } from '@astryxdesign/core/VStack'
import { Illustration } from '@/components/illustrations/illustration'
import { BackButton } from '@/components/navigation/back-button'

// Placeholder for screens that each get their own plan (profiles, tracks, uploads, …),
// so the shell's links already land somewhere real. Detail screens get a back button.
export function ComingSoon({ title, hasBack }: { title: string; hasBack?: boolean }) {
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        {hasBack && <BackButton className="mm-page-back" />}
        <Heading level={1}>{title}</Heading>
      </VStack>
      <EmptyState
        icon={<Illustration name="music" />}
        title="Coming soon"
        description="This screen is still being built."
      />
    </VStack>
  )
}
