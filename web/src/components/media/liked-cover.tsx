import { Icon } from '@astryxdesign/core/Icon'
import { HeartIcon } from '@heroicons/react/24/solid'
import './media.css'

// The likes playlist's cover: it has no artwork of its own, so a heart on the accent
// wash, at the same sizes as CoverArt (Library's row tile, the Liked tracks header).
export function LikedCover({ size }: { size: 'sm' | 'lg' | 'xl' }) {
  return (
    <span className="mm-cover mm-liked-cover" data-size={size} aria-hidden="true">
      <Icon icon={HeartIcon} color="inherit" />
    </span>
  )
}
