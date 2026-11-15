import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { useCallback, useRef } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router'

/** A page-sized form's guard (Edit profile, Edit track, the upload steps): leaving with
 *  unsaved edits asks "Discard changes?" first — in-app navigation (back, tabs, links,
 *  Cancel) through the router's blocker, closing or reloading the tab through the
 *  browser's own prompt. Call `markSaved()` after a successful save, before navigating
 *  away, so leaving then doesn't ask. Render `dialog` somewhere in the page. */
export function useUnsavedChanges(isDirty: boolean, description: string) {
  const isSavedRef = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !isSavedRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (isDirty && !isSavedRef.current) e.preventDefault()
      },
      [isDirty],
    ),
  )

  const dialog = (
    <AlertDialog
      isOpen={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
      title="Discard changes?"
      description={description}
      cancelLabel="Keep editing"
      actionLabel="Discard"
      actionVariant="destructive"
      onAction={() => blocker.proceed?.()}
    />
  )
  return {
    dialog,
    markSaved: () => {
      isSavedRef.current = true
    },
  }
}
