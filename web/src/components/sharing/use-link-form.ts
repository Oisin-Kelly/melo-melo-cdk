import { useEffect, useRef, useState } from 'react'
import { lengthError } from '@/components/forms/saved-text'
import { LIMITS } from '@/config/limits'
import {
  shareLinkUrl,
  useCreateLink,
  useRestoreLink,
  useRevokeLink,
  type LinkExpiry,
  type LinkKind,
} from '@/lib/share-links'

/** How long a row's Copy button reads "Copied". */
const COPIED_FOR_MS = 2000

/** The Share dialog's Link tab: the new-link form, and what happened to the links in the list.
 *  Everything is reported inside the dialog — an error banner, "Copied" on the button, a revoked
 *  row with Undo — never a toast, which would sit behind the open (modal) dialog. The dialog owns
 *  it so Create link can sit in its footer and closing can ask about an unsaved caption. */
export function useLinkForm(kind: LinkKind, id: string) {
  const create = useCreateLink(kind, id)
  const revoke = useRevokeLink(kind, id)
  const restore = useRestoreLink(kind, id)
  const [expiresIn, setExpiresIn] = useState<LinkExpiry>('7d')
  const [allowPreview, setAllowPreview] = useState(true)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  // Revoked while the dialog is open: kept in the list with Undo until it closes
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(() => new Set())
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const captionError = lengthError(caption, LIMITS.caption, 'multi')

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const copy = async (token: string) => {
    setError(null)
    try {
      await navigator.clipboard.writeText(shareLinkUrl(token))
      setCopiedToken(token)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopiedToken(null), COPIED_FOR_MS)
    } catch {
      setError(`Couldn't copy the link. Here it is to copy yourself: ${shareLinkUrl(token)}`)
    }
  }

  const submit = () => {
    setError(null)
    create.mutate(
      { expiresIn, allowPreview, caption },
      {
        onSuccess: (link) => {
          setCaption('')
          void copy(link.token)
        },
        onError: () => setError("Couldn't create a link. Please try again."),
      },
    )
  }

  const revokeLink = (token: string) => {
    setError(null)
    revoke.mutate(token, {
      onSuccess: () => setRevoked((current) => new Set(current).add(token)),
      onError: () => setError("Couldn't revoke the link. Please try again."),
    })
  }

  const undoRevoke = (token: string) => {
    setError(null)
    restore.mutate(token, {
      onSuccess: () =>
        setRevoked((current) => {
          const next = new Set(current)
          next.delete(token)
          return next
        }),
      onError: () => setError("Couldn't undo. Please try again."),
    })
  }

  const reset = () => {
    setExpiresIn('7d')
    setAllowPreview(true)
    setCaption('')
    setError(null)
    setCopiedToken(null)
    setRevoked(new Set())
  }

  return {
    kind,
    id,
    expiresIn,
    setExpiresIn,
    allowPreview,
    setAllowPreview,
    caption,
    setCaption,
    captionError,
    error,
    copiedToken,
    revoked,
    isDirty: caption.trim() !== '',
    isCreating: create.isPending,
    submit,
    copy,
    revokeLink,
    undoRevoke,
    reset,
  }
}

export type LinkForm = ReturnType<typeof useLinkForm>
