import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { CheckIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { sileo } from 'sileo'
import { Wordmark } from '@/components/brand/wordmark'
import { Illustration } from '@/components/illustrations/illustration'
import { CoverArt } from '@/components/media/cover-art'
import { ExpandableText } from '@/components/media/detail-section'
import { tint } from '@/components/media/tint'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { isNotFound } from '@/lib/api-client'
import { useAuth } from '@/lib/auth/auth-context'
import {
  clearPendingInvite,
  isLinkGone,
  linkTargetPath,
  savePendingInvite,
  shareLinkPath,
  useAcceptLink,
  useLinkPreview,
  useLinkViewer,
  useUndoAccept,
  type LinkPreview,
  type LinkTarget,
  type LinkViewer,
} from '@/lib/share-links'
import type { UserSummary } from '@/types/api'
import { formatDuration, formatLength } from '@/utils/format'
import { usePreviewPlayer, type PreviewItem } from '../hooks/use-preview-player'
import { expiresIn } from '../utils/expires-in'
import './invite.css'

type ValidPreview = Extract<LinkPreview, { state: 'VALID' }>

const nameOf = (user: UserSummary) => user.displayName || user.username

// The screen a share link opens (/s/:token). Signed in or out — it sits outside the app's auth
// guard. Every state it can be in is in docs/frontend-notes/share-links.md.
export function InvitePage() {
  const { token = '' } = useParams()
  const { status } = useAuth()
  const preview = useLinkPreview(token)
  const signedIn = status === 'signedIn'
  const isValid = preview.data?.state === 'VALID'
  const viewer = useLinkViewer(token, signedIn && isValid)
  const [didAcceptFail, setDidAcceptFail] = useState(false)
  const isMobile = useIsMobile()

  // Opened signed out: remember it, so signing up in another tab still comes back here. Once
  // you're signed in and back on it, the handoff is done — otherwise every sign-in for a day
  // would bounce here (an owner's own link, or a tab closed without choosing). A dead link is
  // forgotten too.
  useEffect(() => {
    if (status === 'signedOut' && isValid) savePendingInvite(token)
    if (status === 'signedIn' || (preview.data && preview.data.state !== 'VALID')) clearPendingInvite()
  }, [status, isValid, preview.data, token])

  let content: ReactNode
  if (preview.isPending || status === 'loading') {
    content = (
      <VStack padding={10} hAlign="center">
        <Spinner size="lg" />
      </VStack>
    )
  } else if (preview.isError || (viewer.isError && !isNotFound(viewer.error))) {
    content = (
      <EmptyState
        icon={<Illustration name="offline" />}
        title="Couldn't load this link"
        description="Check your connection and try again."
        actions={
          <Button
            label="Try again"
            onClick={() => void (preview.isError ? preview.refetch() : viewer.refetch())}
          />
        }
      />
    )
  } else if (preview.data.state === 'UNAVAILABLE' || viewer.isError) {
    content = <Unavailable signedIn={signedIn} didAcceptFail={didAcceptFail} />
  } else if (preview.data.state === 'EXPIRED') {
    content = (
      <Expired
        sender={preview.data.sender}
        kind={preview.data.kind}
        signedIn={signedIn}
        didAcceptFail={didAcceptFail}
      />
    )
  } else {
    content = (
      <Valid
        token={token}
        preview={preview.data}
        signedIn={signedIn}
        viewer={viewer.data}
        onAcceptFailed={() => {
          setDidAcceptFail(true)
          void preview.refetch()
        }}
      />
    )
  }

  const body = (
    <VStack>
      <VStack paddingBlock={4} hAlign="center">
        <Wordmark href="/" />
      </VStack>
      {content}
    </VStack>
  )

  // On the brand gradient: phones show it straight on the page, wider screens in a card
  return (
    <div className="mm-invite">
      {isMobile ? (
        <VStack width="100%" maxWidth="30rem">
          {body}
        </VStack>
      ) : (
        <Card width="100%" maxWidth="30rem" padding={0} elevation="med">
          {body}
        </Card>
      )}
    </div>
  )
}

function StoppedWorkingNotice() {
  return (
    <VStack paddingInline={4}>
      <Banner status="error" title="Couldn't add it" description="This link stopped working while the page was open." />
    </VStack>
  )
}

function Unavailable({ signedIn, didAcceptFail }: { signedIn: boolean; didAcceptFail: boolean }) {
  return (
    <VStack gap={4} paddingBlockEnd={6}>
      {didAcceptFail && <StoppedWorkingNotice />}
      <EmptyState
        icon={<Illustration name="lost" />}
        title="This link isn't available"
        description="It may have been turned off, typed wrong, or the music was removed. If someone sent you this, ask them for a new link."
        actions={
          signedIn ? <Button label="Go to your library" variant="primary" href="/library" /> : <Button label="Go to MeloMelo" variant="primary" href="/" />
        }
      />
    </VStack>
  )
}

function Expired({ sender, kind, signedIn, didAcceptFail }: {
  sender: UserSummary
  kind: 'TRACK' | 'ALBUM'
  signedIn: boolean
  didAcceptFail: boolean
}) {
  return (
    <VStack gap={4} paddingBlockEnd={6}>
      {didAcceptFail && <StoppedWorkingNotice />}
      <VStack gap={4} paddingInline={5} hAlign="center">
        <span className="mm-invite-locked" aria-hidden="true">
          <Icon icon={LockClosedIcon} size="lg" />
        </span>
        <VStack gap={1} hAlign="center">
          <Heading level={1} justify="center">
            This link has expired
          </Heading>
          <Text color="secondary" justify="center">
            <Text weight="semibold" color="primary">
              {nameOf(sender)}
            </Text>{' '}
            shared {kind === 'TRACK' ? 'a track' : 'an album'} with you, but the link has expired. Ask{' '}
            {nameOf(sender)} to send you a new one.
          </Text>
        </VStack>
        {signedIn ? (
          <Button label="Go to your library" variant="primary" width="100%" href="/library" />
        ) : (
          <Button label="Back to MeloMelo" variant="primary" width="100%" href="/" />
        )}
      </VStack>
    </VStack>
  )
}

function Valid({ token, preview, signedIn, viewer, onAcceptFailed }: {
  token: string
  preview: ValidPreview
  signedIn: boolean
  viewer: LinkViewer | undefined
  onAcceptFailed: () => void
}) {
  const navigate = useNavigate()
  const { username, signOut } = useAuth()
  const accept = useAcceptLink(token)
  const undo = useUndoAccept(token)
  const [added, setAdded] = useState<LinkTarget | null>(null)
  const player = usePreviewPlayer({
    onError: () => sileo.error({ title: "Couldn't play the preview", description: 'Reload the page to try again.' }),
  })
  const isAlbum = preview.kind === 'ALBUM'
  const isOwn = viewer?.relation === 'OWN'
  const playable: PreviewItem[] = preview.tracks.map((t) => ({ id: t.id, url: t.preview.url }))
  const nextPath = encodeURIComponent(shareLinkPath(token))

  const handleAccept = () =>
    accept.mutate(undefined, {
      onSuccess: (target) => {
        player.stop()
        setAdded(target)
      },
      onError: (error) => {
        if (isLinkGone(error)) onAcceptFailed()
        else sileo.error({ title: "Couldn't add it", description: 'Check your connection and try again.' })
      },
    })

  const handleUndo = (target: LinkTarget) =>
    undo.mutate(target, {
      onSuccess: () => {
        setAdded(null)
        sileo.success({ title: 'Removed from your library', description: preview.name })
      },
      onError: () => sileo.error({ title: "Couldn't undo", description: 'Check your connection and try again.' }),
    })

  const handleNotNow = () => {
    clearPendingInvite()
    void navigate('/')
  }

  const expiryLine = (
    <Text type="supporting" size="sm" justify="center">
      Link expires {expiresIn(preview.expiresAt)}
    </Text>
  )

  let actions: ReactNode
  if (added) {
    actions = (
      <VStack gap={2}>
        <HStack gap={1} hAlign="center" vAlign="center">
          <Icon icon={CheckIcon} size="sm" />
          <Text weight="semibold">Added to your library</Text>
        </HStack>
        <Button label="Open" variant="primary" width="100%" href={linkTargetPath(added)} />
        <Button label="Undo" variant="ghost" width="100%" isLoading={undo.isPending} onClick={() => handleUndo(added)} />
      </VStack>
    )
  } else if (!signedIn) {
    actions = (
      <VStack gap={2}>
        <Button label="Create an account to keep it" variant="primary" width="100%" href={`/signup?next=${nextPath}`} />
        <Button label="I already have an account" width="100%" href={`/login?next=${nextPath}`} />
        {expiryLine}
      </VStack>
    )
  } else if (!viewer) {
    actions = (
      <VStack paddingBlock={2} hAlign="center">
        <Spinner />
      </VStack>
    )
  } else if (isOwn) {
    const path = linkTargetPath(viewer.target)
    actions = (
      <VStack gap={2}>
        <Button label="Open" variant="primary" width="100%" href={path} />
        <Button label="Manage links" width="100%" href={`${path}?share=links`} />
        <Text type="supporting" size="sm" justify="center">
          This is what people see when they open your link.
        </Text>
      </VStack>
    )
  } else if (viewer.relation === 'ALREADY_HAVE') {
    actions = (
      <VStack gap={2}>
        <HStack gap={1} hAlign="center" vAlign="center">
          <Icon icon={CheckIcon} size="sm" />
          <Text weight="semibold">You already have this</Text>
        </HStack>
        <Button label="Open" variant="primary" width="100%" href={linkTargetPath(viewer.target)} />
      </VStack>
    )
  } else {
    actions = (
      <VStack gap={2}>
        <Button
          label={isAlbum ? 'Add album to my library' : 'Add to my library'}
          variant="primary"
          width="100%"
          isLoading={accept.isPending}
          onClick={handleAccept}
        />
        <Button label="Not now" width="100%" onClick={handleNotNow} />
        {expiryLine}
      </VStack>
    )
  }

  const signedInAs = signedIn && !isOwn && !added && (
    <Text type="supporting" size="sm" justify="center">
      Signed in as @{username} ·{' '}
      <Link href={shareLinkPath(token)} size="sm" onClick={() => void signOut()}>
        Not you?
      </Link>
    </Text>
  )

  const ownStats = isOwn && viewer.link && (
    <Text type="supporting" size="sm" justify="center">
      This link: {viewer.link.acceptedCount} added · expires {expiresIn(viewer.link.expiresAt)}
    </Text>
  )

  const heading = isOwn ? (
    <Text type="label" size="sm" weight="semibold" color="secondary">
      {isAlbum ? 'THIS IS YOUR ALBUM' : 'THIS IS YOUR TRACK'}
    </Text>
  ) : (
    <HStack gap={2} vAlign="center" hAlign="center">
      <Avatar size="xsm" src={preview.sender.imageUrl ?? undefined} name={nameOf(preview.sender)} tooltip={false} />
      <Text size="sm" color="secondary">
        <Text size="sm" weight="semibold" color="primary">
          {nameOf(preview.sender)}
        </Text>{' '}
        shared {isAlbum ? 'an album' : 'a track'} with you
      </Text>
    </HStack>
  )

  // The sender's note, quoted under the item
  const caption = preview.caption && (
    <div className="mm-invite-caption" style={tint(preview.imageBgColor)}>
      <VStack paddingInline={3} paddingBlock={2}>
        <ExpandableText text={preview.caption} />
      </VStack>
    </div>
  )

  if (isAlbum) {
    return (
      <VStack gap={4} paddingBlockEnd={5}>
        <div className="mm-invite-wash" style={tint(preview.imageBgColor)}>
          <VStack gap={4} padding={5}>
            {heading}
            <HStack gap={4} vAlign="center">
              <span className="mm-invite-cover">
                <CoverArt imageUrl={preview.imageUrl ?? null} imageBgColor={preview.imageBgColor ?? null} size="lg" />
              </span>
              <StackItem size="fill">
                <VStack gap={1}>
                  <Text type="label" size="sm" weight="semibold" color="secondary">
                    ALBUM
                  </Text>
                  <Heading level={1} maxLines={2}>
                    {preview.name}
                  </Heading>
                  <Text type="supporting">
                    {nameOf(preview.sender)} · {preview.tracks.length} track{preview.tracks.length === 1 ? '' : 's'} ·{' '}
                    {formatLength(preview.duration)}
                  </Text>
                </VStack>
              </StackItem>
            </HStack>
            {caption}
            {/* Its own row: beside the cover it's cut off on the narrowest phones */}
            {playable.length > 0 && (
              <HStack>
                <Button
                  label={player.isPlayingAll ? 'Stop' : 'Preview all'}
                  size="sm"
                  icon={<Icon icon={player.isPlayingAll ? PauseIcon : PlayIcon} />}
                  onClick={() => (player.isPlayingAll ? player.stop() : player.playAll(playable))}
                />
              </HStack>
            )}
          </VStack>
        </div>
        <VStack gap={3} paddingInline={5}>
          {ownStats}
          {actions}
          {signedInAs}
        </VStack>
        <VStack paddingInline={3}>
          {preview.tracks.map((track) => {
            const isPlaying = player.playingId === track.id
            return (
              <HStack
                key={track.id}
                gap={3}
                vAlign="center"
                padding={2}
                className={isPlaying ? 'mm-invite-row mm-invite-row-playing' : 'mm-invite-row'}
              >
                <IconButton
                  label={isPlaying ? `Stop ${track.name}` : `Play ${track.name}`}
                  icon={<Icon icon={isPlaying ? PauseIcon : PlayIcon} />}
                  size="sm"
                  variant="ghost"
                  onClick={() => player.toggle({ id: track.id, url: track.preview.url })}
                />
                <StackItem size="fill">
                  <Text maxLines={1}>{track.name}</Text>
                </StackItem>
                <Text type="supporting" hasTabularNumbers textWrap="nowrap">
                  {formatDuration(track.duration)}
                </Text>
              </HStack>
            )
          })}
        </VStack>
      </VStack>
    )
  }

  const track = preview.tracks[0]
  const isPlaying = track && player.playingId === track.id
  return (
    <VStack gap={4} paddingBlockEnd={5}>
      <div className="mm-invite-wash" style={tint(preview.imageBgColor)}>
        <VStack gap={4} padding={5} hAlign="center">
          {heading}
          <span className="mm-invite-cover">
            <CoverArt imageUrl={preview.imageUrl ?? null} imageBgColor={preview.imageBgColor ?? null} size="xl" />
            {track && (
              <span className="mm-invite-play">
                {/* The app's play button (black on light, white on dark), larger here */}
                <IconButton
                  className="mm-play mm-invite-play-button"
                  label={isPlaying ? 'Stop preview' : track.preview.isFullTrack ? 'Play' : 'Play preview'}
                  icon={<Icon icon={isPlaying ? PauseIcon : PlayIcon} />}
                  variant="primary"
                  size="lg"
                  elevation="med"
                  onClick={() => player.toggle({ id: track.id, url: track.preview.url })}
                />
              </span>
            )}
          </span>
          <VStack gap={1} hAlign="center">
            <Heading level={1} justify="center" maxLines={2}>
              {preview.name}
            </Heading>
            <Text type="supporting" justify="center">
              {[nameOf(preview.sender), formatDuration(preview.duration), preview.genre].filter(Boolean).join(' · ')}
            </Text>
          </VStack>
          {caption && <VStack width="100%">{caption}</VStack>}
          {/* Always there (empty until it plays), so starting and stopping never changes the
              card's height */}
          {track && (
            <VStack width="100%">
              <ProgressBar
                label={track.preview.isFullTrack ? 'Playing' : '30 second preview'}
                value={isPlaying ? player.progress * 100 : 0}
                isLabelHidden
              />
            </VStack>
          )}
        </VStack>
      </div>
      <VStack gap={3} paddingInline={5}>
        {ownStats}
        {actions}
        {signedInAs}
      </VStack>
    </VStack>
  )
}
