import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useNavigate } from 'react-router'

export function NotFoundRoute() {
  const navigate = useNavigate()
  return (
    <VStack
      gap={3}
      padding={8}
      minHeight="100svh"
      hAlign="center"
      vAlign="center"
    >
      <Heading level={1}>404</Heading>
      <Text type="large" color="secondary" justify="center">
        This page could not be found.
      </Text>
      <Button label="Go home" variant="primary" onClick={() => navigate('/')} />
    </VStack>
  )
}
