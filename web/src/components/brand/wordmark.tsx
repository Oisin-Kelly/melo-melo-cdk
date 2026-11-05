import { Link as RouterLink } from 'react-router'
import './brand.css'

type WordmarkProps = {
  size?: 'md' | 'lg' | 'xl'
  /** Renders the wordmark as a link (e.g. home). */
  href?: string
}

// The "melomelo" logotype (Borel, loaded in index.html). As a link it's a plain
// router link rather than Astryx Link, which underlines on hover — a logo shouldn't.
export function Wordmark({ size = 'md', href }: WordmarkProps) {
  if (!href) {
    return (
      <span className="mm-wordmark" data-size={size}>
        melomelo
      </span>
    )
  }
  return (
    <RouterLink to={href} className="mm-wordmark" data-size={size} aria-label="MeloMelo home">
      melomelo
    </RouterLink>
  )
}
