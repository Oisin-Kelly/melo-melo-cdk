import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { sileo } from 'sileo'
import { TimeAgo } from '@/components/feedback/time-ago'
import { DialogLayout } from '@/components/forms/dialog-layout'
import { lengthError } from '@/components/forms/saved-text'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { LinkKind } from '@/lib/share-links'
import type { Recipient, ShareChange, UserSummary } from '@/types/api'
import { nameOf } from '@/types/user'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { PeoplePicker, type Person } from './people-picker'
import { ShareLinksSection } from './share-links-section'
import { useLinkForm } from './use-link-form'
import './sharing.css'

function PersonAvatar({ user, size }: { user: UserSummary; size: 'xsm' | 'sm' }) {
  return <Avatar size={size} src={user.imageUrl ?? undefined} name={nameOf(user)} tooltip={false} />
}

// Someone with access. Remove only marks them ("Will lose access", with Undo); it takes
// effect when the dialog is saved, with everything else.
function RecipientRow({ recipient, isLeaving, onToggle }: { recipient: Recipient; isLeaving: boolean; onToggle: () => void }) {
  const name = nameOf(recipient.user)
  return (
    <HStack gap={3} vAlign="center">
      <div className="mm-recipient" data-leaving={isLeaving}>
        <PersonAvatar user={recipient.user} size="sm" />
      </div>
      <StackItem size="fill">
        <div className="mm-recipient" data-leaving={isLeaving}>
          <VStack gap={0}>
            <Text weight="semibold" maxLines={1}>
              {name}
            </Text>
            <Text type="supporting" color="secondary" maxLines={1}>
              {isLeaving ? (
                'Will lose access'
              ) : (
                <>
                  Shared <TimeAgo ms={recipient.sharedAt} />
                </>
              )}
            </Text>
          </VStack>
        </div>
      </StackItem>
      {isLeaving ? (
        <Button label="Undo" variant="ghost" size="sm" onClick={onToggle} />
      ) : (
        <IconButton
          label={`Remove ${name}'s access`}
          tooltip="Remove access"
          variant="ghost"
          icon={<Icon icon={XMarkIcon} />}
          onClick={onToggle}
        />
      )}
    </HStack>
  )
}

/** People with access shown before "Show all"; past FILTER_FROM a filter box appears. */
const LIST_PREVIEW = 5
const FILTER_FROM = 10

type Props = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** What's being shared, for the title and toasts ("Demos '26"). */
  name: string
  /** "album" / "track". */
  kind: string
  /** What sharing gives them, under the title. */
  /** Who has it now (owner-only recipients endpoint), loaded while the dialog is open. */
  recipients: UseQueryResult<Recipient[]>
  /** POST …/share. */
  share: UseMutationResult<unknown, Error, ShareChange>
  /** Adds the Link tab (share links for this item). */
  links?: { kind: LinkKind; id: string }
  /** Which tab it opens on (the invite screen's "Manage links" opens on Link). */
  initialTab?: ShareTab
}

export type ShareTab = 'people' | 'link'

// Owner-only, for albums and tracks: share with more people (with an optional caption
// that shows in their feed) and withdraw access from people who have it. Nothing happens
// until Save: picked people, the caption and removals all go in one request, and the
// button says what it will do ("Share with 2 · Remove 1"). Closing with unsaved changes
// asks first. The page passes its own recipients query and share mutation.
export function ShareDialog({ isOpen, onOpenChange, name, kind, recipients, share, links, initialTab = 'people' }: Props) {
  const [tab, setTab] = useState<ShareTab>(links ? initialTab : 'people')
  const linkForm = useLinkForm(links?.kind ?? 'TRACK', links?.id ?? '')
  const [picked, setPicked] = useState<Person[]>([])
  const [caption, setCaption] = useState('')
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [isShowingAll, setIsShowingAll] = useState(false)
  const [filter, setFilter] = useState('')
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)

  // Frontend check of the caption (the API's limit); shown under the caption, blocks Save
  const captionError = lengthError(caption, LIMITS.caption, 'multi')
  const hasAccess = useMemo(() => new Set(recipients.data?.map((r) => r.user.username)), [recipients.data])
  const isPeopleDirty = picked.length > 0 || caption.trim() !== '' || leaving.size > 0
  const isDirty = isPeopleDirty || linkForm.isDirty

  const reset = () => {
    setPicked([])
    setCaption('')
    setLeaving(new Set())
    setError(null)
    setIsShowingAll(false)
    setFilter('')
    linkForm.reset()
    setTab(links ? initialTab : 'people')
  }
  const close = () => {
    setIsConfirmingDiscard(false)
    onOpenChange(false)
    reset()
  }
  const requestClose = () => (isDirty ? setIsConfirmingDiscard(true) : close())

  const toggleLeaving = (username: string) =>
    setLeaving((current) => {
      const next = new Set(current)
      if (next.has(username)) next.delete(username)
      else next.add(username)
      return next
    })

  const save = () => {
    const add = picked.map((p) => p.id)
    const remove = [...leaving]
    share.mutate(
      { add, remove, caption },
      {
        onSuccess: () => {
          // People who don't accept shares are dropped silently (by design), so this
          // stays generic rather than claiming a count
          if (add.length > 0) sileo.success({ title: `${kind[0].toUpperCase()}${kind.slice(1)} shared`, description: name })
          else sileo.success({ title: remove.length === 1 ? 'Access removed' : `Access removed for ${remove.length} people`, description: name })
          close()
        },
        onError: (err) => {
          // The API's 400s carry a user-safe message: shown above the form, not on any one field
          if (err instanceof ApiError && err.status === 400) setError(err.message)
          // Shown in the dialog, not as a toast: it would sit behind the open dialog
          else setError("Couldn't save your changes. Please try again.")
        },
      },
    )
  }

  const saveLabel =
    [picked.length > 0 && `Share with ${picked.length}`, leaving.size > 0 && `Remove ${leaving.size}`]
      .filter(Boolean)
      .join(' · ') || 'Share'

  const all = recipients.data ?? []
  const query = filter.trim().toLowerCase()
  const matching = query
    ? all.filter((r) => r.user.username.includes(query) || nameOf(r.user).toLowerCase().includes(query))
    : all
  const shown = isShowingAll || query ? matching : matching.slice(0, LIST_PREVIEW)

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : requestClose())} purpose="form" width={520}>
      <DialogLayout
        header={<DialogHeader title={`Share ${name}`} onOpenChange={requestClose} />}
        footer={
          tab === 'link' ? (
            <HStack gap={2} hAlign="end">
              <Button label="Close" variant="ghost" onClick={requestClose} />
              <Button
                label="Create link"
                variant="primary"
                isDisabled={Boolean(linkForm.captionError)}
                isLoading={linkForm.isCreating}
                onClick={linkForm.submit}
              />
            </HStack>
          ) : (
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="ghost" onClick={requestClose} />
              <Button label={saveLabel} variant="primary" isDisabled={!isPeopleDirty || (picked.length === 0 && leaving.size === 0) || Boolean(captionError)} isLoading={share.isPending} onClick={save} />
            </HStack>
          )
        }
      >
        <VStack gap={4}>
          {links && (
            <SegmentedControl label="Share with" value={tab} onChange={(value) => setTab(value as ShareTab)}>
              <SegmentedControlItem value="people" label="People" />
              <SegmentedControlItem value="link" label="Link" />
            </SegmentedControl>
          )}
          {tab === 'link' && links ? (
            <ShareLinksSection form={linkForm} />
          ) : (
          <>
          {error && <Banner status="error" title={error} />}
          <PeoplePicker
            value={picked}
            onChange={(items) => {
              setPicked(items)
              setError(null)
              // Picking someone marked to lose access means keeping them
              setLeaving((current) => {
                const next = new Set(current)
                for (const item of items) next.delete(item.id)
                return next
              })
            }}
            describe={(person) =>
              hasAccess.has(person.id) ? `@${person.id} · already has it` : `@${person.id}`
            }
            hasAutoFocus
          />
          <TextArea
            label="Caption"
            isOptional
            value={caption}
            onChange={(value) => {
              setCaption(value)
              setError(null)
            }}
            maxLength={LIMITS.caption}
            rows={2}
            status={captionError ? { type: 'error', message: captionError } : undefined}
          />
          <Divider />

          <VStack gap={3}>
            <Text type="label" weight="semibold">
              People with access{all.length > 0 && ` (${all.length})`}
            </Text>
            {recipients.isPending ? (
              <Center axis="horizontal" padding={2}>
                <Spinner size="md" aria-label="Loading people with access" />
              </Center>
            ) : recipients.isError ? (
              <HStack gap={2} vAlign="center">
                <Text type="supporting" color="secondary">
                  Couldn't load who has access.
                </Text>
                <Button label="Retry" size="sm" onClick={() => void recipients.refetch()} />
              </HStack>
            ) : all.length === 0 ? (
              <Text type="supporting" color="secondary">
                Only you, so far.
              </Text>
            ) : (
              <>
                {all.length > FILTER_FROM && (
                  <TextInput
                    label="Find someone with access"
                    isLabelHidden
                    placeholder="Find someone with access"
                    value={filter}
                    onChange={setFilter}
                    hasClear
                    size="sm"
                  />
                )}
                {shown.map((recipient) => (
                  <RecipientRow
                    key={recipient.user.username}
                    recipient={recipient}
                    isLeaving={leaving.has(recipient.user.username)}
                    onToggle={() => toggleLeaving(recipient.user.username)}
                  />
                ))}
                {query && matching.length === 0 && (
                  <Text type="supporting" color="secondary">
                    No one with access matches “{filter.trim()}”.
                  </Text>
                )}
                {!query && !isShowingAll && all.length > LIST_PREVIEW && (
                  <StackItem>
                    <Button label={`Show all ${all.length}`} variant="ghost" size="sm" onClick={() => setIsShowingAll(true)} />
                  </StackItem>
                )}
              </>
            )}
          </VStack>

          </>
          )}
        </VStack>
      </DialogLayout>

      <AlertDialog
        isOpen={isConfirmingDiscard}
        onOpenChange={setIsConfirmingDiscard}
        title="Discard changes?"
        description={
          isPeopleDirty
            ? "The people you picked, your caption and any removals won't be saved."
            : "The caption for your new link won't be saved."
        }
        actionLabel="Discard"
        onAction={close}
      />
    </Dialog>
  )
}
