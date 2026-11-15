import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'

// One section of a page-sized form (Astryx's settings template): title + description
// beside the fields, wrapping to stacked when the page is narrower than two 320px columns
// (then a tighter gap, or the title floats away from its fields). `max` keeps the one
// column within a screen narrower than 320px (an SE: the column would overflow it)
export function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const isMobile = useIsMobile()
  return (
    <Grid columns={{ minWidth: 320, max: 2 }} gap={isMobile ? 4 : 10}>
      <VStack gap={1}>
        <Heading level={3}>{title}</Heading>
        <Text type="supporting" color="secondary">
          {description}
        </Text>
      </VStack>
      <VStack gap={4}>{children}</VStack>
    </Grid>
  )
}
