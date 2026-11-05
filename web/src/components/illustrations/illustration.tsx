import cassette from '@/assets/illustrations/cassette.svg?raw'
import crackedRecord from '@/assets/illustrations/cracked-record.svg?raw'
import headphones from '@/assets/illustrations/headphones.svg?raw'
import magnifier from '@/assets/illustrations/magnifier.svg?raw'
import radio from '@/assets/illustrations/radio.svg?raw'
import vinylSleeve from '@/assets/illustrations/vinyl-sleeve.svg?raw'
import './illustration.css'

// Empty-state illustrations: MeloMelo's own music objects (a cassette, a record in its
// sleeve, headphones…) — flat shapes, an ink outline and the logo teal, tilted and
// sparkled to keep them playful (~1KB each, so simply bundled). Drawn with five
// placeholder colours, mapped onto theme variables so they follow the brand and
// light/dark mode. Colours go in `style`, because SVG fill/stroke *attributes* don't
// resolve CSS variables.
const PALETTE: Record<string, string> = {
  '#30b0c7': 'var(--color-text-teal)', // the logo teal
  '#1d1d1f': 'var(--mm-illustration-ink)', // outlines: flip to light in dark mode
  '#2c2c2e': 'var(--mm-illustration-record)', // records: stay dark in both modes
  '#ffffff': 'var(--color-background-card)',
  '#cfeef4': 'var(--mm-illustration-soft)', // a teal tint: the ground line, the lens
}

// Per element, swap the mapped fill/stroke attributes for one style attribute (an element
// can only have one — a second would be ignored, losing e.g. the outline).
function themed(svg: string): string {
  return svg.replace(/<[a-z][^>]*>/g, (tag) => {
    const styles: string[] = []
    const rest = tag.replace(/\s(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (match, attr: string, hex: string) => {
      const mapped = PALETTE[hex.toLowerCase()]
      if (!mapped) return match
      styles.push(`${attr}:${mapped}`)
      return ''
    })
    return styles.length ? rest.replace(/^<([a-z]+)/, `<$1 style="${styles.join(';')}"`) : tag
  })
}

const SOURCES = {
  /** A record sliding out of its sleeve: where shares will land (empty Home). */
  'new-shares': themed(vinylSleeve),
  /** A cassette: no music here yet. */
  music: themed(cassette),
  /** Headphones at rest, "z z": nothing's happened (empty activity). */
  quiet: themed(headphones),
  /** A magnifier over a note: no search results. */
  searching: themed(magnifier),
  /** A cracked record and a question mark: not found, or couldn't load. */
  lost: themed(crackedRecord),
  /** A radio whose signal breaks off: offline. */
  offline: themed(radio),
} as const

export type IllustrationName = keyof typeof SOURCES

type Props = {
  name: IllustrationName
  /** 'sm' for panes and popovers, 'md' for page empty states. */
  size?: 'sm' | 'md'
}

// Decorative: EmptyState's title carries the meaning, so this is hidden from readers.
export function Illustration({ name, size = 'md' }: Props) {
  return (
    <span
      className="mm-illustration"
      data-size={size}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SOURCES[name] }}
    />
  )
}
