import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import type { QueryKey } from '@tanstack/react-query'
import { useState } from 'react'
import { sileo } from 'sileo'
import { useLeaveAfterDelete } from './go-back'

type LeaveKind = 'delete' | 'leave'

type LeaveOption = {
  mutation: { mutateAsync: () => Promise<unknown>; isPending: boolean }
  /** The dialog's explanation of what happens. */
  description: string
}

type Options = {
  /** "track" / "album" / "playlist", for the toasts. */
  what: string
  name: string
  /** The page's detail cache, dropped once it has left. */
  detailKey: QueryKey
  /** Where to land when there's no previous page (opened from a link). */
  fallback?: string
  /** Owner: delete it for good. */
  delete: LeaveOption
  /** Recipient: take it out of your library. */
  leave?: LeaveOption
}

// "Delete X?" / "Remove X?" for a page's own item: confirm, run the mutation, toast, then
// go back like the ← button. `ask('delete' | 'leave')` opens it; render `dialog` once.
export function useConfirmLeave({ what, name, detailKey, fallback, delete: deleting, leave }: Options) {
  const goAway = useLeaveAfterDelete(detailKey, fallback)
  const [kind, setKind] = useState<LeaveKind | null>(null)
  // A failed delete/remove: said in the dialog itself (it stays open, and a toast would sit behind it)
  const [didFail, setDidFail] = useState(false)
  const isLeave = kind === 'leave'
  const option = isLeave && leave ? leave : deleting

  const confirm = async () => {
    setDidFail(false)
    try {
      await option.mutation.mutateAsync()
    } catch {
      setDidFail(true)
      return
    }
    setKind(null)
    sileo.success({
      title: isLeave ? 'Removed from your library' : `${what[0].toUpperCase()}${what.slice(1)} deleted`,
      description: name,
    })
    goAway()
  }

  const dialog = (
    <AlertDialog
      isOpen={kind !== null}
      onOpenChange={(open) => {
        if (open) return
        setKind(null)
        setDidFail(false)
      }}
      title={`${isLeave ? 'Remove' : 'Delete'} ${name}?`}
      description={
        didFail ? `Couldn't ${isLeave ? 'remove' : 'delete'} the ${what}. Check your connection and try again.` : option.description
      }
      actionLabel={isLeave ? 'Remove' : 'Delete'}
      isActionLoading={option.mutation.isPending}
      onAction={confirm}
    />
  )

  return { ask: (next: LeaveKind) => setKind(next), dialog }
}
