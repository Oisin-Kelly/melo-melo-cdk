import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack } from '@astryxdesign/core/HStack'
import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { lengthError } from '@/components/forms/saved-text'
import { LIMITS } from '@/config/limits'
import { PeoplePicker, type Person } from './people-picker'
import type { BulkResult } from '@/lib/bulk'

// Sharing several tracks or albums at once (the manage tables): pick people and a caption
// once, and every selected one is shared with them — each a share of its own, so it shows
// in their feed one by one, as if shared one at a time. Someone who already has one gets it
// resurfaced with this caption (the share endpoints' upsert).
export function BulkShareDialog({
  count,
  noun,
  share,
  isOpen,
  onOpenChange,
  onShared,
}: {
  /** How many are selected, and what they are: [one, many] ("track", "tracks"). */
  count: number
  noun: readonly [string, string]
  /** Shares every selected one with these usernames. */
  share: (add: string[], caption: string) => Promise<BulkResult>
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Called once it has closed, when at least one was shared. */
  onShared: (result: BulkResult, people: number) => void
}) {
  const [isSharing, setIsSharing] = useState(false)
  const [picked, setPicked] = useState<Person[]>([])
  const [caption, setCaption] = useState('')
  // Nothing went through: said here (the dialog stays open, and a toast would sit behind it)
  const [didFail, setDidFail] = useState(false)
  const captionError = lengthError(caption, LIMITS.caption, 'multi')

  const close = () => {
    onOpenChange(false)
    setPicked([])
    setCaption('')
    setDidFail(false)
  }

  const save = async () => {
    setDidFail(false)
    setIsSharing(true)
    const result = await share(picked.map((p) => p.id), caption).finally(() => setIsSharing(false))
    if (result.done.length === 0) {
      setDidFail(true)
      return
    }
    const people = picked.length
    close()
    onShared(result, people)
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} purpose="form" width={520}>
      <DialogLayout
        header={<DialogHeader title={`Share ${count} ${count === 1 ? noun[0] : noun[1]}`} onOpenChange={() => close()} />}
        footer={
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" onClick={close} />
            <Button
              label={picked.length > 0 ? `Share with ${picked.length}` : 'Share'}
              variant="primary"
              isDisabled={picked.length === 0 || Boolean(captionError)}
              isLoading={isSharing}
              onClick={() => void save()}
            />
          </HStack>
        }
      >
        <VStack gap={4}>
          {didFail && <Banner status="error" title="Couldn't share them. Check your connection and try again." />}
          <PeoplePicker value={picked} onChange={setPicked} hasAutoFocus />
          <TextArea
            label="Caption"
            isOptional
            value={caption}
            onChange={setCaption}
            maxLength={LIMITS.caption}
            rows={2}
            status={captionError ? { type: 'error', message: captionError } : undefined}
          />
        </VStack>
      </DialogLayout>
    </Dialog>
  )
}
