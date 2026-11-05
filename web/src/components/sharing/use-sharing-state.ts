import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { ShareTab } from './share-dialog'

/** Whether a track/album page's Share dialog is open, and which tab it opens on. `?share=links`
 *  opens it on its Link tab on arrival — the invite screen's "Manage links" for your own link —
 *  and closing it drops the parameter. */
export function useSharingState(): [boolean, (isOpen: boolean) => void, ShareTab] {
  const [params, setParams] = useSearchParams()
  const [opensOnLinks] = useState(() => params.get('share') === 'links')
  const [isSharing, setIsSharing] = useState(opensOnLinks)

  const set = (isOpen: boolean) => {
    setIsSharing(isOpen)
    if (!isOpen && params.has('share'))
      setParams(
        (current) => {
          current.delete('share')
          return current
        },
        { replace: true },
      )
  }
  return [isSharing, set, opensOnLinks ? 'link' : 'people']
}
