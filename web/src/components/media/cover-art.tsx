import type { CSSProperties } from 'react'
import './media.css'

type CoverArtProps = {
  imageUrl: string | null
  /** The cover's dominant colour from the server; used behind the image and as the placeholder. */
  imageBgColor: string | null
  /** Alt text; omit for decorative covers next to a visible title. */
  alt?: string
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

// Square cover for a track, album or playlist. With no image it shows a gradient in
// the item's dominant colour (or a neutral tone), so rows never have a hole.
export function CoverArt({ imageUrl, imageBgColor, alt, size }: CoverArtProps) {
  const style = imageBgColor ? ({ '--mm-cover': imageBgColor } as CSSProperties) : undefined
  return (
    <span className="mm-cover" data-size={size} style={style}>
      {imageUrl && <img src={imageUrl} alt={alt ?? ''} loading="lazy" />}
    </span>
  )
}
