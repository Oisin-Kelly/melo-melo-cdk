import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Center } from '@astryxdesign/core/Center'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { StackItem } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { VStack } from '@astryxdesign/core/VStack'
import { CheckIcon } from '@heroicons/react/24/outline'
import { LIMITS } from '@/config/limits'
import { EXPIRY_OPTIONS, useItemLinks, type LinkExpiry, type ShareLink } from '@/lib/share-links'
import type { LinkForm } from './use-link-form'

/** "5 days left", "22 hours left", "under an hour left". */
function timeLeft(expiresAt: number, now = Date.now()): string {
  const hours = (expiresAt - now) / 3_600_000
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} left`
  }
  if (hours >= 1) {
    const whole = Math.floor(hours)
    return `${whole} hour${whole === 1 ? '' : 's'} left`
  }
  return 'under an hour left'
}

const createdOn = (epochMs: number) =>
  new Date(epochMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function LinkRow({ link, form }: { link: ShareLink; form: LinkForm }) {
  const isRevoked = form.revoked.has(link.token)
  const details = isRevoked
    ? 'Revoked — no one new can use it'
    : [timeLeft(link.expiresAt), `preview ${link.allowPreview ? 'on' : 'off'}`, `${link.acceptedCount} added`].join(' · ')
  return (
    <HStack gap={2} vAlign="center">
      <StackItem size="fill">
        <VStack gap={0}>
          <Text weight="semibold" maxLines={1} color={isRevoked ? 'secondary' : undefined}>
            Created {createdOn(link.createdAt)}
          </Text>
          <Text type="supporting" color="secondary" maxLines={1}>
            {details}
          </Text>
          {link.caption && !isRevoked && (
            <Text type="supporting" color="secondary" maxLines={1}>
              “{link.caption}”
            </Text>
          )}
        </VStack>
      </StackItem>
      {isRevoked ? (
        <Button label="Undo" size="sm" variant="ghost" onClick={() => form.undoRevoke(link.token)} />
      ) : (
        <>
          <Button
            label={form.copiedToken === link.token ? 'Copied' : 'Copy'}
            size="sm"
            icon={form.copiedToken === link.token ? <Icon icon={CheckIcon} /> : undefined}
            onClick={() => void form.copy(link.token)}
          />
          <Button label="Revoke" size="sm" variant="ghost" onClick={() => form.revokeLink(link.token)} />
        </>
      )}
    </HStack>
  )
}

// The Share dialog's Link tab (owner only). Unlike the People tab, which waits for its Share
// button, links act immediately — you need one to copy it — so a revoked link stays in the list
// with Undo until the dialog closes. Feedback is all inline (see useLinkForm).
export function ShareLinksSection({ form, isShortTrack = false }: { form: LinkForm; isShortTrack?: boolean }) {
  const links = useItemLinks(form.kind, form.id, true)
  const word = form.kind === 'TRACK' ? 'track' : 'album'
  const shown = (links.data ?? []).filter((link) => link.state === 'ACTIVE' || form.revoked.has(link.token))
  const previewHint =
    form.kind === 'ALBUM' ? '30s of each track before adding' : isShortTrack ? 'Plays in full before adding' : '30s before adding'

  return (
    <VStack gap={4}>
      {form.error && <Banner status="error" title={form.error} />}
      <Text type="supporting" color="secondary">
        Anyone with a link can add this {word} until it expires or you revoke it. Removing someone from People
        doesn't stop them using a link they still have.
      </Text>
      <SegmentedControl label="Expires in" value={form.expiresIn} onChange={(value) => form.setExpiresIn(value as LinkExpiry)}>
        {EXPIRY_OPTIONS.map((option) => (
          <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
        ))}
      </SegmentedControl>
      <Switch label="Allow preview" description={previewHint} value={form.allowPreview} onChange={form.setAllowPreview} />
      <TextArea
        label="Caption"
        isOptional
        description={`Shown when they open the link, and with the ${word} in their feed once they add it.`}
        value={form.caption}
        onChange={form.setCaption}
        maxLength={LIMITS.caption}
        rows={2}
        status={form.captionError ? { type: 'error', message: form.captionError } : undefined}
      />

      <VStack gap={3}>
        <Text type="label" weight="semibold">
          Your links
        </Text>
        {links.isPending ? (
          <Center axis="horizontal" padding={2}>
            <Spinner size="md" aria-label="Loading links" />
          </Center>
        ) : links.isError ? (
          <HStack gap={2} vAlign="center">
            <Text type="supporting" color="secondary">
              Couldn't load your links.
            </Text>
            <Button label="Retry" size="sm" onClick={() => void links.refetch()} />
          </HStack>
        ) : shown.length === 0 ? (
          <Text type="supporting" color="secondary">
            No links yet.
          </Text>
        ) : (
          shown.map((link) => <LinkRow key={link.token} link={link} form={form} />)
        )}
      </VStack>
    </VStack>
  )
}
