import type { CSSProperties, ReactNode } from 'react'
import './brand.css'

// Large soft colour shapes drifting and morphing very slowly behind optional content.
// Decorative only; colours come from the theme's categorical palette so they follow
// light/dark, and motion stops under prefers-reduced-motion.
const BLOBS = [
  { colour: 'cyan', x: '8%', y: '12%', size: '58%', duration: '62s' },
  { colour: 'purple', x: '52%', y: '4%', size: '52%', duration: '74s' },
  { colour: 'orange', x: '36%', y: '52%', size: '56%', duration: '68s' },
  { colour: 'teal', x: '-6%', y: '58%', size: '46%', duration: '80s' },
] as const

type GradientBlobsProps = {
  children?: ReactNode
  /** Fill the viewport (landing page) instead of the parent's height (auth split). */
  isFullPage?: boolean
}

export function GradientBlobs({ children, isFullPage }: GradientBlobsProps) {
  return (
    <div className="mm-blobs" data-full-page={isFullPage || undefined}>
      {BLOBS.map((blob, i) => (
        <span
          key={blob.colour}
          className="mm-blob"
          aria-hidden="true"
          style={
            {
              '--mm-blob': `var(--color-data-categorical-${blob.colour})`,
              '--mm-blob-x': blob.x,
              '--mm-blob-y': blob.y,
              '--mm-blob-size': blob.size,
              '--mm-blob-duration': blob.duration,
              animationDelay: `${i * -11}s`,
            } as CSSProperties
          }
        />
      ))}
      {children && <div className="mm-blobs-content">{children}</div>}
    </div>
  )
}
