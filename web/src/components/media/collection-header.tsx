import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { Fragment, type ReactNode } from 'react'
import { useIsCompact } from '@/hooks/use-is-compact'
import { CoverArt } from './cover-art'
import { ExpandableText } from './detail-section'
import { Hero } from './hero'
import { PlayButton } from './media-rows'

type Props = {
  imageUrl: string | null
  /** The cover's dominant colour: tints the header (and the placeholder cover). */
  imageBgColor: string | null
  /** Replaces the square cover, e.g. a profile's round photo (about the cover's size). */
  cover?: ReactNode
  /** "Playlist" / "Album" / "Track". */
  kind: string
  title: string
  /** Who it's by, as a link or avatar line. */
  byline?: ReactNode
  /** "8 tracks · 29 min" and the like; omit when the byline already carries it. */
  meta?: ReactNode
  actions: ReactNode
  /** The play button: a "Play all"-style pill first in the buttons row on wide screens, a
   *  big round button at the row's end on compact ones (where the thumb is). */
  play?: { label: string; text: string; onPlay?: () => void }
  /** Compact screens show it in the header, two quiet lines that expand on tap (wide
   *  screens: the page's own Description section, so pass it only when compact). */
  description?: string | null
  /** Opposite the label, on its line (e.g. the date). Wide screens only. */
  labelEnd?: ReactNode
  /** At the right end of the buttons row (e.g. who it's shared with). */
  aside?: ReactNode
  /** Where the back button goes when there's no previous page (opened from a link). */
  backFallback?: string
  /** Compact screens, for a profile: byline and meta rendered as given (one small Text
   *  per line) beside the photo, no kind, and only the buttons underneath in one row —
   *  wrap the first action in a fill StackItem to make it full width. */
  isCompactBeside?: boolean
  /** Fills the rest of the back button's row on phones (e.g. search + sort). */
  backEnd?: ReactNode
  /** Compact screens: only the back button's row (with backEnd), with no colour wash —
   *  no cover, details or buttons — e.g. while a search's results take over the page. */
  isCollapsed?: boolean
}

// The top of a track, album, playlist or profile page, washed in the cover's colour.
// Two arrangements:
// - Wide: the cover, and beside it one column — label (with the date opposite), title,
//   byline, meta, buttons — sitting on the cover's bottom edge. Every line is one line
//   (too long ends in "…", full text on hover) so the column fits the cover's height.
// - Compact (tablets, phones — useIsCompact): short, so the first tracks show without
//   scrolling — a smaller cover beside the title, byline and meta (led by the kind), the
//   description as two quiet lines, then the buttons with play as a big round button at
//   the row's end. A profile (isCompactBeside) keeps its own arrangement.
export function CollectionHeader({
  imageUrl,
  imageBgColor,
  kind,
  title,
  byline,
  meta,
  actions,
  labelEnd,
  aside,
  backFallback,
  cover,
  isCompactBeside = false,
  backEnd,
  isCollapsed = false,
  play,
  description,
}: Props) {
  const isCompact = useIsCompact()
  // The page's main image: the only one with a shadow (.mm-hero-image)
  const image = (size: 'lg' | 'xl') => (
    <div className="mm-hero-image">
      {cover ?? <CoverArt imageUrl={imageUrl} imageBgColor={imageBgColor} size={size} />}
    </div>
  )
  const pill = play && <PlayButton label={play.label} text={play.text} onPlay={play.onPlay} />
  const buttons = (
    <HStack gap={2} vAlign="center" hAlign="between">
      <HStack gap={2} vAlign="center" wrap="wrap">
        {pill}
        {actions}
      </HStack>
      {aside}
    </HStack>
  )
  const label = (
    <Text type="label" size="sm" weight="semibold" color="secondary">
      {kind.toUpperCase()}
    </Text>
  )

  if (isCompact && isCompactBeside) {
    return (
      <Hero colour={imageBgColor} back={{ fallback: backFallback }}>
        {/* Top-aligned: the text can be taller than the image, and must never rise above it.
            Spacing: 4px under the name, 8px between the byline group (who) and the meta
            group (numbers), lines within a group touching; 16px between blocks (Hero's gap). */}
        <HStack gap={4} vAlign="start">
          {image('xl')}
          <StackItem size="fill">
            <VStack gap={1}>
              <Heading level={1} maxLines={2} className="mm-beside-title">
                {title}
              </Heading>
              <VStack gap={2}>
                <VStack>{byline}</VStack>
                {meta && <VStack>{meta}</VStack>}
              </VStack>
            </VStack>
          </StackItem>
        </HStack>
        {/* One row, no wrapping: the page can make its first action fill it (StackItem) */}
        <HStack gap={2} vAlign="center">
          {pill}
          {actions}
        </HStack>
      </Hero>
    )
  }

  if (isCompact && isCollapsed) {
    return (
      <Hero colour={imageBgColor} back={{ fallback: backFallback }} backEnd={backEnd} isPlain />
    )
  }

  if (isCompact) {
    // Each piece kept whole ("4 min" never splits): the line only wraps between them
    const metaParts = [kind, ...(typeof meta === 'string' ? meta.split(' · ') : meta ? [meta] : [])]
    return (
      <Hero colour={imageBgColor} back={{ fallback: backFallback }} backEnd={backEnd}>
        <HStack gap={4} vAlign="start">
          {image('lg')}
          <StackItem size="fill">
            <VStack gap={1}>
              <Heading level={1} maxLines={3} className="mm-beside-title">
                {title}
              </Heading>
              {byline}
              {/* "Playlist · 5 tracks · 4 min" */}
              <Text type="supporting" color="secondary">
                {metaParts.map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 && ' · '}
                    <span className="mm-stat">{part}</span>
                  </Fragment>
                ))}
              </Text>
            </VStack>
          </StackItem>
        </HStack>
        {description && <ExpandableText text={description} type="supporting" color="secondary" lines={2} isTextToggle />}
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <HStack gap={2} vAlign="center" wrap="wrap">
              {actions}
            </HStack>
          </StackItem>
          {aside}
          {play && <PlayButton label={play.label} size="lg" onPlay={play.onPlay} />}
        </HStack>
      </Hero>
    )
  }

  return (
    <Hero colour={imageBgColor} back={{ fallback: backFallback }}>
      <HStack gap={6} vAlign="end">
        {image('xl')}
        <StackItem size="fill">
          <VStack gap={3}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center" hAlign="between">
                {label}
                {labelEnd}
              </HStack>
              <Heading level={1} type="display-3" maxLines={1}>
                {title}
              </Heading>
              {byline}
              {meta && (
                <Text type="body" color="secondary" maxLines={1}>
                  {meta}
                </Text>
              )}
            </VStack>
            {buttons}
          </VStack>
        </StackItem>
      </HStack>
    </Hero>
  )
}
