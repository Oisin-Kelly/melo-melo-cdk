import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { GradientBlobs } from '@/components/brand/gradient-blobs'
import { Wordmark } from '@/components/brand/wordmark'

// Public landing page at `/` for signed-out visitors. Deliberately simple and
// temporary: a proper marketing page replaces it later. Every endpoint needs an
// account, so there is no data to show here.
export function LandingRoute() {
  return (
    <GradientBlobs isFullPage>
      <VStack gap={6} hAlign="center">
        <Wordmark size="xl" />
        <Text type="large" color="secondary" justify="center">
          Share your tracks privately with friends.
        </Text>
        <HStack gap={3} wrap="wrap" hAlign="center">
          <Button label="Create an account" variant="primary" size="lg" href="/signup" />
          <Button label="Sign in" variant="secondary" size="lg" href="/login" />
        </HStack>
      </VStack>
    </GradientBlobs>
  )
}
