import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import type { ThemeMode } from '@/components/theme/theme-mode'
import {
  DENSITY_LABELS,
  TEXT_SIZE_LABELS,
  useDisplayPrefs,
  type Density,
  type TextSize,
} from '@/components/theme/use-display-prefs'
import { MODE_LABELS, useThemeMode } from '@/components/theme/use-theme-mode'
import { BackButton } from '@/components/navigation/back-button'
import './appearance.css'

/** Light / Dark / Automatic. */
export function AppearanceControl() {
  const { mode, setMode } = useThemeMode()
  return (
    <SegmentedControl label="Theme" value={mode} onChange={(value) => setMode(value as ThemeMode)}>
      {(Object.keys(MODE_LABELS) as ThemeMode[]).map((value) => (
        <SegmentedControlItem key={value} value={value} label={MODE_LABELS[value]} />
      ))}
    </SegmentedControl>
  )
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <VStack gap={2}>
      <VStack gap={0.5}>
        <Text type="label" weight="semibold">
          {title}
        </Text>
        {description && (
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  )
}

// A tiny still drawing of a list at one density: cover squares and text bars filling the
// same box height — three comfortable rows, five compact ones
const PREVIEW_ROWS: Record<Density, number> = { comfortable: 3, compact: 5 }
function DensityPreview({ density }: { density: Density }) {
  return (
    <div className="mm-density-preview" data-density={density} aria-hidden="true">
      {Array.from({ length: PREVIEW_ROWS[density] }, (_, row) => (
        <div key={row} className="mm-density-preview-row">
          <span className="mm-density-preview-cover" />
          <span className="mm-density-preview-lines">
            <span className="mm-density-preview-bar" style={{ width: row % 2 ? '55%' : '75%' }} />
            <span className="mm-density-preview-bar" style={{ width: row % 3 ? '45%' : '35%' }} />
          </span>
        </div>
      ))}
    </div>
  )
}

// Settings → Appearance: a section of the desktop settings layout, and its own screen on
// phones (a row on the Settings list, showing the current choice). Every choice is per device
// and applies straight away — no Save.
export function AppearancePage() {
  const { textSize, setTextSize, density, setDensity } = useDisplayPrefs()

  return (
    <VStack gap={6} maxWidth="30rem">
      <VStack gap={2}>
        <BackButton fallback="/settings" className="mm-page-back" />
        <Heading level={1}>Appearance</Heading>
      </VStack>

      <Group title="Theme" description="Automatic follows your device's light or dark setting.">
        <AppearanceControl />
      </Group>

      <Group title="Text size" description="Every screen, from track names to page titles.">
        {/* A list, not a segmented control: four sizes don't fit across a small phone */}
        <RadioList label="Text size" isLabelHidden value={textSize} onChange={(value) => setTextSize(value as TextSize)}>
          {(Object.keys(TEXT_SIZE_LABELS) as TextSize[]).map((value) => (
            <RadioListItem key={value} value={value} label={TEXT_SIZE_LABELS[value]} />
          ))}
        </RadioList>
      </Group>

      <Group title="Density" description="How tightly lists of tracks, albums and people are packed.">
        <Grid columns={2} gap={3}>
          {(Object.keys(DENSITY_LABELS) as Density[]).map((value) => (
            <SelectableCard
              key={value}
              label={DENSITY_LABELS[value]}
              isSelected={density === value}
              onChange={() => setDensity(value)}
              padding={3}
              // On the page background (the default card fill is near-black in dark mode)
              variant="transparent"
              className={density === value ? undefined : 'mm-density-card-idle'}
            >
              <VStack gap={3}>
                <DensityPreview density={value} />
                <Text weight="semibold">{DENSITY_LABELS[value]}</Text>
              </VStack>
            </SelectableCard>
          ))}
        </Grid>
      </Group>
    </VStack>
  )
}
