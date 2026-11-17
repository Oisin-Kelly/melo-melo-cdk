import { useEffect, useRef, type RefObject } from 'react'

// A hidden file input, opened by a button of its own (`ref.current.click()`). Cancelling the
// browser's file picker fires a `cancel` event on the input that bubbles — and a <dialog>
// takes `cancel` as "close" (it's what Escape sends), so the dialog or sheet it's in would
// close along with the picker. Stopped at the input, by a native listener so it runs before
// the dialog's own, however that's attached.
export function FileInput({
  ref,
  accept,
  onPick,
}: {
  ref: RefObject<HTMLInputElement | null>
  accept: string
  onPick: (file: File) => void
}) {
  const own = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const input = own.current
    if (!input) return
    const keepDialogOpen = (event: Event) => event.stopPropagation()
    input.addEventListener('cancel', keepDialogOpen)
    return () => input.removeEventListener('cancel', keepDialogOpen)
  }, [])

  return (
    <input
      ref={(input) => {
        own.current = input
        ref.current = input
      }}
      type="file"
      accept={accept}
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onPick(file)
        e.target.value = '' // so picking the same file again still fires
      }}
    />
  )
}
