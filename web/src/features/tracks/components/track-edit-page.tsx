import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { ArrowDownTrayIcon, LinkIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { sileo } from 'sileo'
import { PageLoader } from '@/components/feedback/page-loader'
import { UnavailableScreen } from '@/components/feedback/unavailable-screen'
import { DetailsFields } from '@/components/forms/details-fields'
import { useDetailsDraft } from '@/components/forms/use-details-draft'
import { FormSection } from '@/components/forms/form-section'
import { useUnsavedChanges } from '@/components/forms/use-unsaved-changes'
import { CoverArt } from '@/components/media/cover-art'
import { BackButton } from '@/components/navigation/back-button'
import { useConfirmLeave } from '@/components/navigation/confirm-leave'
import { useGoBack } from '@/components/navigation/go-back'
import type { ShareTab } from '@/components/sharing/share-dialog'
import { LIMITS } from '@/config/limits'
import { ApiError, isNotFound } from '@/lib/api-client'
import { useUsername } from '@/lib/auth/auth-context'
import { profilePath, trackEditPath, trackPath, useCanonicalPath } from '@/lib/links'
import { formatDate, formatDuration } from '@/utils/format'
import { trackDetailKey, useDeleteTrack, useDownloadOriginal, useTrack, useUpdateTrack, type Track } from '../api/tracks'
import { SharedWith, TrackShareDialog } from './track-sharing'

// Edit track (/{owner}/{slug}/edit, owner only): everything about one of your tracks, in
// the sections the upload wizard will walk through one at a time — its audio (the
// original file to download), its details (one Save) and who has it — then Delete.
// Sharing, downloading and deleting act straight away; only the details wait for Save.
export function TrackEditPage({ trackId }: { trackId: string }) {
  const me = useUsername()
  const detail = useTrack(trackId)
  useCanonicalPath(detail.data && detail.data.owner.username === me ? trackEditPath(detail.data) : undefined)

  if (detail.isPending) return <PageLoader what="track" />
  if (detail.isError)
    return <UnavailableScreen what="track" isMissing={isNotFound(detail.error)} onRetry={() => void detail.refetch()} />
  // Only its owner can edit it; anyone else sees what a missing track looks like
  if (detail.data.owner.username !== me) return <UnavailableScreen what="track" isMissing onRetry={() => {}} />

  const track = detail.data
  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <BackButton fallback={trackPath(track)} className="mm-page-back" />
        <VStack gap={1}>
          <Heading level={1}>Edit track</Heading>
          <Text type="body" color="secondary" maxLines={1}>
            {track.name}
          </Text>
        </VStack>
      </VStack>
      <AudioSection track={track} />
      <Divider />
      <DetailsSection key={track.id} track={track} />
      <Divider />
      <SharingSection track={track} />
      <Divider />
      <DeleteSection track={track} />
    </VStack>
  )
}

function AudioSection({ track }: { track: Track }) {
  const download = useDownloadOriginal(track.id)
  return (
    <FormSection title="Audio" description="The file you uploaded. To use different audio, upload it as a new track.">
      <HStack gap={3} vAlign="center">
        <CoverArt imageUrl={track.imageUrl} imageBgColor={track.imageBgColor} size="md" />
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Text type="body" weight="semibold" maxLines={1}>
              {track.name}
            </Text>
            <Text type="supporting" color="secondary">
              {formatDuration(track.duration)} · Uploaded {formatDate(track.createdAt)}
            </Text>
          </VStack>
        </StackItem>
      </HStack>
      <HStack>
        {/* The file exactly as uploaded (wav, flac…), not the streaming copy */}
        <Button
          label="Download original"
          variant="secondary"
          icon={<Icon icon={ArrowDownTrayIcon} />}
          isLoading={download.isPending}
          onClick={() => download.mutate()}
        />
      </HStack>
    </FormSection>
  )
}

// Cover, name, genre, description and URL, saved together (the upload wizard's details
// step is the same fields). Leaving with unsaved changes asks first.
function DetailsSection({ track }: { track: Track }) {
  const update = useUpdateTrack(track.id)
  const goBack = useGoBack(trackPath(track))
  const draft = useDetailsDraft(
    { name: track.name, genre: track.genre ?? '', description: track.description ?? '' },
    {
      descriptionLimit: LIMITS.trackDescription,
      url: track.slug ? { pathPrefix: `/${track.owner.username}/`, slug: track.slug } : undefined,
    },
  )
  const [formError, setFormError] = useState<string | null>(null)
  const unsaved = useUnsavedChanges(
    draft.isDirty,
    "You have unsaved changes to this track's details. If you leave now, they won't be saved.",
  )

  const save = async () => {
    if (!draft.canSave) return
    const { name, genre, description, cover, slug } = draft.toDetails()
    try {
      await update.mutateAsync({ name, genre: genre ?? '', description, cover: cover.file, clearCover: cover.clear, slug })
      unsaved.markSaved()
      sileo.success({ title: 'Saved', description: name.trim() })
      // Back to the track (an old URL still leads there if the URL changed)
      goBack()
    } catch (err) {
      // The API's 400s carry a user-safe message (e.g. that URL is already used)
      setFormError(
        err instanceof ApiError && err.status === 400 ? err.message : "Couldn't save your changes. Please try again.",
      )
    }
  }

  return (
    <FormSection title="Details" description="How it shows to you and the people you share it with.">
      {formError && <Banner status="error" title={formError} />}
      <DetailsFields
        draft={draft}
        currentCover={{ imageUrl: track.imageUrl, imageBgColor: track.imageBgColor }}
        onEnter={() => void save()}
        onCoverPicked={() => setFormError(null)}
        onCoverError={setFormError}
      />
      <HStack gap={2} hAlign="end">
        <Button label="Cancel" variant="secondary" onClick={goBack} />
        <Button
          label="Save changes"
          variant="primary"
          isDisabled={!draft.canSave}
          isLoading={update.isPending}
          onClick={() => void save()}
        />
      </HStack>
      {unsaved.dialog}
    </FormSection>
  )
}

// Who has it: the people it's shared with directly, Manage access / Share, and its links.
// The Share dialog applies its own changes, apart from the details' Save.
function SharingSection({ track }: { track: Track }) {
  const [tab, setTab] = useState<ShareTab | null>(null)
  const isShared = Boolean(track.shareCount)
  return (
    <FormSection
      title="Sharing"
      description="Changes here apply straight away. People who have it through one of your albums are managed on the album."
    >
      <SharedWith track={track} onManage={() => setTab('people')} hasManageButton={false} />
      <HStack gap={2} wrap="wrap">
        <Button
          label={isShared ? 'Manage access' : 'Share'}
          variant="secondary"
          icon={<Icon icon={UserPlusIcon} />}
          onClick={() => setTab('people')}
        />
        <Button label="Share link" variant="secondary" icon={<Icon icon={LinkIcon} />} onClick={() => setTab('link')} />
      </HStack>
      {/* Keyed by tab so it opens on the one asked for */}
      <TrackShareDialog
        key={tab ?? 'closed'}
        track={track}
        isOpen={tab !== null}
        onOpenChange={(isOpen) => !isOpen && setTab(null)}
        initialTab={tab ?? 'people'}
      />
    </FormSection>
  )
}

function DeleteSection({ track }: { track: Track }) {
  const me = useUsername()
  const remove = useDeleteTrack(track.id)
  const confirmLeave = useConfirmLeave({
    what: 'track',
    name: track.name,
    detailKey: trackDetailKey(track.id),
    // The page behind this one is the track's own: land on your profile instead
    leaveTo: profilePath(me),
    delete: {
      mutation: remove,
      description:
        "It goes for good: everyone you shared it with loses it, it leaves your albums, and it shows as unavailable in people's playlists.",
    },
  })
  return (
    <FormSection title="Delete track" description="Removes it for you and everyone it's shared with. This can't be undone.">
      <HStack>
        <Button label="Delete track" variant="destructive" onClick={() => confirmLeave.ask('delete')} />
      </HStack>
      {confirmLeave.dialog}
    </FormSection>
  )
}
