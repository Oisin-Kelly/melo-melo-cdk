import { ShareDialog, type ShareTab } from '@/components/sharing/share-dialog'
import { useAlbumRecipients, useShareAlbum, type Album } from '../api/albums'

type Props = { album: Album; isOpen: boolean; onOpenChange: (isOpen: boolean) => void; initialTab?: ShareTab }

// Owner-only. Sharing an album gives access to every track in it, now and as tracks are added.
export function ShareAlbumDialog({ album, isOpen, onOpenChange, initialTab }: Props) {
  const recipients = useAlbumRecipients(album.id, isOpen)
  const share = useShareAlbum(album.id)
  return (
    <ShareDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      name={album.name}
      kind="album"
      recipients={recipients}
      share={share}
      links={{ kind: 'ALBUM', id: album.id }}
      initialTab={initialTab}
    />
  )
}
