import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import {
  ArrowUpTrayIcon,
  PencilIcon,
  PlusCircleIcon,
  ShareIcon,
  Square2StackIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { sileo } from 'sileo'
import { useAlbumEditor } from '@/components/albums/album-editor-context'
import { dateOptions, isWithin } from '@/components/manage/manage-filters'
import { FilterSelector, ManagePage, NameCell } from '@/components/manage/manage-page'
import { useManageTable } from '@/components/manage/use-manage-table'
import { CoverArt } from '@/components/media/cover-art'
import { TrackMenu } from '@/components/media/media-rows'
import { BulkShareDialog } from '@/components/sharing/bulk-share-dialog'
import { LIMITS } from '@/config/limits'
import { reportBulk } from '@/lib/bulk'
import { trackPath } from '@/lib/links'
import { useAllMyTracks } from '@/lib/my-tracks'
import { usePlaylists, type Playlist } from '@/lib/playlists'
import type { TrackSummary } from '@/types/api'
import { formatDate, formatDuration } from '@/utils/format'
import { useAddTracksToPlaylist, useDeleteTracks, useShareTracks } from '../api/bulk'
import { useTrack } from '../api/tracks'
import { useDismissUpload, usePendingUploads, type PendingUpload } from '../api/upload'
import { TrackEditDialog } from './track-edit-dialog'
import { useUpload } from './upload-context'

// /tracks — Your tracks: everything you've uploaded in one table, to look after in bulk
// (the shared manage layout: components/manage), with uploads still processing or that
// failed pinned at the top. Filters: when uploaded, how long. Bulk: add to a playlist, start an album, share, delete. The pencil edits one
// track in place, in its own page's dialog.

const NOUN = ['track', 'tracks'] as const

const COMPARE = {
  name: (a: TrackSummary, b: TrackSummary) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  length: (a: TrackSummary, b: TrackSummary) => a.duration - b.duration,
  uploaded: (a: TrackSummary, b: TrackSummary) => a.createdAt - b.createdAt,
}

const SORT_LABELS = {
  '-uploaded': 'Newest first',
  uploaded: 'Oldest first',
  name: 'Name A–Z',
  '-name': 'Name Z–A',
  length: 'Shortest first',
  '-length': 'Longest first',
}

// ?uploaded=week|month|year, ?length=short|medium|long
const FILTER_PARAMS = ['uploaded', 'length']
const UPLOADED = dateOptions('Uploaded')
const LENGTH = [
  { value: 'any', label: 'Any length' },
  { value: 'short', label: 'Under 2 min' },
  { value: 'medium', label: '2–6 min' },
  { value: 'long', label: 'Over 6 min' },
]
const LENGTH_TEST: Record<string, (seconds: number) => boolean> = {
  short: (s) => s < 120,
  medium: (s) => s >= 120 && s <= 360,
  long: (s) => s > 360,
}

function matches(track: TrackSummary, params: URLSearchParams, now: number) {
  if (!isWithin(params.get('uploaded'), track.createdAt, now)) return false
  const length = LENGTH_TEST[params.get('length') ?? '']
  return !length || length(track.duration)
}

export function ManageTracksPage() {
  const tracks = useAllMyTracks()
  const uploads = usePendingUploads()
  const dismissUpload = useDismissUpload()
  const openUpload = useUpload().open
  const albumEditor = useAlbumEditor()
  const table = useManageTable({
    items: tracks.data,
    pinned: uploads.data?.map(toUploadRow),
    compare: COMPARE,
    defaultSort: '-uploaded',
    filterParams: FILTER_PARAMS,
    matches,
    what: NOUN[1],
  })
  const { selected } = table
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [didDeleteFail, setDidDeleteFail] = useState(false)
  const deleteTracks = useDeleteTracks()
  const addToPlaylist = useAddTracksToPlaylist()
  const shareTracks = useShareTracks()
  const selectedIds = selected.map((track) => track.id)

  const columns = (isCompact: boolean): TableColumn<TrackSummary | UploadRow>[] => [
    {
      key: 'name',
      header: 'Track',
      sortable: true,
      width: proportional(4, { minWidth: 200 }),
      renderCell: (row) =>
        isUpload(row) ? (
          <UploadNameCell upload={row.upload} />
        ) : (
          <NameCell
            href={trackPath(row)}
            name={row.name}
            imageUrl={row.imageUrl}
            imageBgColor={row.imageBgColor}
            isLiked={row.likedByMe}
          />
        ),
    },
    {
      key: 'length',
      header: 'Length',
      sortable: true,
      width: pixel(isCompact ? 84 : 110),
      align: 'end',
      // Not known until it's processed
      renderCell: (row) => (isUpload(row) ? null : formatDuration(row.duration)),
    },
    ...(isCompact
      ? []
      : [
          {
            key: 'uploaded',
            header: 'Uploaded',
            sortable: true,
            width: pixel(190),
            renderCell: (row: TrackSummary | UploadRow) =>
              formatDate(isUpload(row) ? row.upload.createdAt : row.createdAt),
          },
        ]),
    {
      key: 'actions',
      header: '',
      width: pixel(104),
      align: 'end',
      renderCell: (row) =>
        isUpload(row) ? (
          row.upload.status === 'FAILED' && (
            <IconButton
              label={`Dismiss ${row.name}`}
              variant="ghost"
              icon={<Icon icon={XMarkIcon} color="secondary" />}
              onClick={() => dismissUpload.mutate(row.id)}
            />
          )
        ) : (
          <HStack gap={1} hAlign="end" vAlign="center">
            <IconButton
              label={`Edit ${row.name}`}
              variant="ghost"
              icon={<Icon icon={PencilIcon} color="secondary" />}
              onClick={() => setEditingId(row.id)}
            />
            <TrackMenu track={row} hasGoToItems />
          </HStack>
        ),
    },
  ]

  const addSelectedTo = async (playlist: Playlist) => {
    const result = await addToPlaylist.mutateAsync({ playlist, ids: selectedIds })
    table.keepSelected(result.failed)
    reportBulk(result, { did: 'Added', couldnt: 'add', noun: NOUN, detail: playlist.name })
  }

  const deleteSelected = async () => {
    setDidDeleteFail(false)
    const result = await deleteTracks.mutateAsync(selectedIds)
    // Nothing went: say so in the dialog, which stays open (a toast would sit behind it)
    if (result.done.length === 0) {
      setDidDeleteFail(true)
      return
    }
    setIsDeleting(false)
    table.keepSelected(result.failed)
    reportBulk(result, { did: 'Deleted', couldnt: 'delete', noun: NOUN })
  }

  const isOverAlbumLimit = selected.length > LIMITS.albumTracks

  return (
    <ManagePage
      tab="tracks"
      title="Your tracks"
      noun={NOUN}
      // The uploads list only adds rows: the table doesn't wait on it or fail with it
      status={tracks.status}
      onRetry={() => void tracks.refetch()}
      empty={{ title: 'No tracks yet', description: 'Tracks you upload show up here, to edit, share and organise.' }}
      table={table}
      columns={columns}
      sortLabels={SORT_LABELS}
      actions={
        <>
          <Button label="Upload track" variant="primary" size="lg" icon={<Icon icon={ArrowUpTrayIcon} />} onClick={openUpload} />
          <Button
            label="New album"
            variant="secondary"
            size="lg"
            icon={<Icon icon={Square2StackIcon} />}
            onClick={() => albumEditor.create()}
          />
        </>
      }
      filters={
        <>
          <FilterSelector table={table} param="uploaded" label="Uploaded" options={UPLOADED} />
          <FilterSelector table={table} param="length" label="Length" options={LENGTH} />
        </>
      }
      bulk={({ isIconOnly, isDisabled }) => (
        <>
          <AddToPlaylistMenu
            isIconOnly={isIconOnly}
            isDisabled={isDisabled}
            isBusy={addToPlaylist.isPending}
            onPick={(playlist) => void addSelectedTo(playlist)}
          />
          <Button
            label="New album from selected"
            variant="ghost"
            icon={<Icon icon={Square2StackIcon} />}
            isIconOnly={isIconOnly}
            isDisabled={isDisabled || isOverAlbumLimit}
            tooltip={isOverAlbumLimit ? `An album holds up to ${LIMITS.albumTracks} tracks` : undefined}
            onClick={() => albumEditor.create(selected)}
          />
          <Button
            label="Share"
            variant="ghost"
            icon={<Icon icon={ShareIcon} />}
            isIconOnly={isIconOnly}
            isDisabled={isDisabled}
            onClick={() => setIsSharing(true)}
          />
          <Button
            label="Delete"
            variant="destructive"
            icon={<Icon icon={TrashIcon} />}
            isIconOnly={isIconOnly}
            isDisabled={isDisabled}
            onClick={() => setIsDeleting(true)}
          />
        </>
      )}
    >
      {editingId && <EditTrack key={editingId} id={editingId} onClose={() => setEditingId(null)} />}
      <BulkShareDialog
        count={selected.length}
        noun={NOUN}
        share={(add, caption) => shareTracks.mutateAsync({ ids: selectedIds, add, caption })}
        isOpen={isSharing}
        onOpenChange={setIsSharing}
        onShared={(result, people) => {
          table.keepSelected(result.failed)
          reportBulk(result, {
            did: 'Shared',
            couldnt: 'share',
            noun: NOUN,
            detail: `With ${people} ${people === 1 ? 'person' : 'people'}`,
          })
        }}
      />
      <AlertDialog
        isOpen={isDeleting}
        onOpenChange={(open) => {
          if (open) return
          setIsDeleting(false)
          setDidDeleteFail(false)
        }}
        title={selected.length === 1 ? `Delete ${selected[0].name}?` : `Delete ${selected.length} tracks?`}
        description={
          didDeleteFail
            ? "Couldn't delete them. Check your connection and try again."
            : 'They go for good, for you and everyone they are shared with, and leave every album they are in.'
        }
        actionLabel="Delete"
        actionVariant="destructive"
        isActionLoading={deleteTracks.isPending}
        onAction={deleteSelected}
      />
    </ManagePage>
  )
}

// An upload that isn't a track yet, pinned above your tracks (useManageTable's `pinned`):
// processing, or failed with ✕ to clear it
type UploadRow = { id: string; name: string; upload: PendingUpload }

const toUploadRow = (upload: PendingUpload): UploadRow => ({ id: upload.trackId, name: upload.name, upload })
const isUpload = (row: TrackSummary | UploadRow): row is UploadRow => 'upload' in row

function UploadNameCell({ upload }: { upload: PendingUpload }) {
  const isFailed = upload.status === 'FAILED'
  return (
    <span className="mm-manage-cell">
      <CoverArt imageUrl={null} imageBgColor={null} size="sm" />
      <Text color="secondary" className="mm-manage-cell-name">
        {upload.name}
      </Text>
      {isFailed ? (
        <Tooltip content={upload.error ?? "Couldn't process it."}>
          <Badge variant="error" label="Upload failed" />
        </Tooltip>
      ) : (
        <Badge variant="neutral" icon={<Spinner size="sm" shade="inherit" />} label="Processing" />
      )}
    </span>
  )
}

// The bar's "Add to playlist": your own playlists (the likes playlist only changes by liking)
function AddToPlaylistMenu({
  isIconOnly,
  isDisabled,
  isBusy,
  onPick,
}: {
  isIconOnly: boolean
  isDisabled: boolean
  isBusy: boolean
  onPick: (playlist: Playlist) => void
}) {
  const playlists = usePlaylists()
  const targets = (playlists.data ?? []).filter((playlist) => playlist.type === 'CUSTOM')
  const items: DropdownMenuOption[] = playlists.isPending
    ? [{ label: 'Loading…', isDisabled: true }]
    : targets.length === 0
      ? [{ label: 'No playlists yet', isDisabled: true }]
      : targets.map((playlist) => ({ id: playlist.id, label: playlist.name, onClick: () => onPick(playlist) }))

  return (
    <DropdownMenu
      renderTrigger={(props) => (
        <Button
          {...props}
          label="Add to playlist"
          variant="ghost"
          icon={<Icon icon={PlusCircleIcon} />}
          isIconOnly={isIconOnly}
          isDisabled={isDisabled}
          isLoading={isBusy}
        />
      )}
      items={items}
    />
  )
}

// The edit dialog wants the whole track (genre, description), which rows don't carry:
// fetched when the pencil is pressed, the dialog opening once it's here
function EditTrack({ id, onClose }: { id: string; onClose: () => void }) {
  const track = useTrack(id)
  const [didReport, setDidReport] = useState(false)
  if (track.isError && !didReport) {
    setDidReport(true)
    sileo.error({ title: "Couldn't open the track", description: 'Please try again.' })
    onClose()
  }
  if (!track.data) return null
  return <TrackEditDialog track={track.data} isOpen onOpenChange={(open) => !open && onClose()} />
}
