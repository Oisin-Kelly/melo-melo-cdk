import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CountedTextInput } from '@/components/forms/counted-text-input'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { lengthError } from '@/components/forms/saved-text'
import { sileo } from 'sileo'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { playlistPath } from '@/lib/links'
import { useCreatePlaylist } from '../api/playlists'

type Props = { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }

export function CreatePlaylistDialog({ isOpen, onOpenChange }: Props) {
  const navigate = useNavigate()
  const me = useUsername()
  const create = useCreatePlaylist()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // A failed save that isn't about the name: shown in the dialog (a toast would sit behind it)
  const [failure, setFailure] = useState<string | null>(null)

  const close = () => {
    onOpenChange(false)
    setName('')
    setError(null)
    setFailure(null)
    create.reset()
  }

  const handleCreate = () => {
    if (!name.trim()) {
      setError('Give your playlist a name.')
      return
    }
    const tooLong = lengthError(name, LIMITS.name)
    if (tooLong) {
      setError(tooLong)
      return
    }
    setFailure(null)
    create.mutate(name, {
      onSuccess: (playlist) => {
        sileo.success({ title: 'Playlist created', description: playlist.name })
        close()
        navigate(playlistPath(playlist, me))
      },
      onError: (err) => {
        // 400s carry a user-safe validation message from the API
        if (err instanceof ApiError && err.status === 400) setError(err.message)
        else setFailure("Couldn't create the playlist. Please try again.")
      },
    })
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} purpose="form" width={520}>
      <DialogLayout
        header={<DialogHeader title="New playlist" onOpenChange={() => close()} />}
        footer={
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" onClick={close} />
            <Button label="Create" variant="primary" isLoading={create.isPending} onClick={handleCreate} />
          </HStack>
        }
      >
        <VStack gap={4}>
        {failure && <Banner status="error" title={failure} />}
        <CountedTextInput
          label="Name"
          maxLength={LIMITS.name}
          value={name}
          onChange={(v) => {
            setName(v)
            setError(null)
          }}
          onEnter={handleCreate}
          placeholder="Late night mix"
          hasAutoFocus
          status={error ? { type: 'error', message: error } : undefined}
        />
        </VStack>
      </DialogLayout>
    </Dialog>
  )
}
