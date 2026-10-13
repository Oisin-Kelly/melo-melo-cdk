import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'

// Placeholder landing. Build real screens from templates:
// `npx astryx build "<idea>"` then `npx astryx template <name>`.
export function HomeRoute() {
  return (
    <VStack
      gap={3}
      padding={8}
      minHeight="100svh"
      hAlign="center"
      vAlign="center"
    >
      <Heading level={1}>MeloMelo</Heading>
      <Text type="large" color="secondary" justify="center">
        Private music sharing, now building on the Astryx design system.
      </Text>
      <Button label="Get started" variant="primary" />
    </VStack>
  )
}
