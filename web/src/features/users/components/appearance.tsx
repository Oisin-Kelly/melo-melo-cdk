import { Heading } from '@astryxdesign/core/Heading'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { ThemeMode } from '@/components/theme/theme-mode'
import { useThemeMode } from '@/components/theme/use-theme-mode'
import { BackButton } from '@/components/navigation/back-button'

/** Light / Dark / Automatic: the phone Settings list and the desktop Appearance section. */
export function AppearanceControl() {
  const { mode, setMode } = useThemeMode()
  return (
    <SegmentedControl label="Appearance" value={mode} onChange={(value) => setMode(value as ThemeMode)}>
      <SegmentedControlItem value="light" label="Light" />
      <SegmentedControlItem value="dark" label="Dark" />
      <SegmentedControlItem value="system" label="Automatic" />
    </SegmentedControl>
  )
}

// Settings → Appearance: its own section in the desktop settings layout (phones have the
// control inline on the Settings list, so they only land here from a link).
export function AppearancePage() {
  return (
    <VStack gap={6} maxWidth="30rem">
      <VStack gap={2}>
        <BackButton fallback="/settings" className="mm-page-back" />
        <Heading level={1}>Appearance</Heading>
      </VStack>
      <VStack gap={2}>
        <Text color="secondary">Automatic follows your device's light or dark setting.</Text>
        <AppearanceControl />
      </VStack>
    </VStack>
  )
}
