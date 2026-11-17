import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import {
  ArrowTopRightOnSquareIcon,
  Bars3BottomLeftIcon,
  EllipsisHorizontalIcon,
  InboxIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useState } from 'react'
import { sileo } from 'sileo'
import { useAlbumEditor } from '@/components/albums/album-editor-context'
import { EditDetailsDialog } from '@/components/forms/edit-details-dialog'
import { dateOptions, isWithin } from '@/components/manage/manage-filters'
import { FilterSelector, FilterToggle, ManagePage, NameCell } from '@/components/manage/manage-page'
import { useManageTable } from '@/components/manage/use-manage-table'
import { BulkShareDialog } from '@/components/sharing/bulk-share-dialog'
import { reportBulk } from '@/lib/bulk'
import { albumPath } from '@/lib/links'
import type { AlbumSummary } from '@/types/api'
import { formatDate, formatLength } from '@/utils/format'
import {
  fetchWholeAlbum,
  useAlbumDetail,
  useAllMyAlbums,
  useDeleteAlbums,
  useShareAlbums,
  useUpdateAlbum,
} from '../api/albums'

// /albums — Your albums: every album you've made in one table (the shared manage layout:
// components/manage). Filters: No tracks, when created. Bulk: share,
// delete. Per row: the pencil edits its details, ⋯ opens it, edits its tracks or deletes it.

const NOUN = ['album', 'albums'] as const

const COMPARE = {
  name: (a: AlbumSummary, b: AlbumSummary) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  tracks: (a: AlbumSummary, b: AlbumSummary) => a.trackCount - b.trackCount,
  length: (a: AlbumSummary, b: AlbumSummary) => a.totalDurationSeconds - b.totalDurationSeconds,
  created: (a: AlbumSummary, b: AlbumSummary) => a.createdAt - b.createdAt,
}

const SORT_LABELS = {
  '-created': 'Newest first',
  created: 'Oldest first',
  name: 'Name A–Z',
  '-name': 'Name Z–A',
  '-tracks': 'Most tracks',
  tracks: 'Fewest tracks',
  '-length': 'Longest first',
  length: 'Shortest first',
}

// ?tracks=none, ?created=week|month|year
const FILTER_PARAMS = ['tracks', 'created']
const CREATED = dateOptions('Created')

function matches(album: AlbumSummary, params: URLSearchParams, now: number) {
  if (params.get('tracks') === 'none' && album.trackCount > 0) return false
  return isWithin(params.get('created'), album.createdAt, now)
}

export function ManageAlbumsPage() {
  const albums = useAllMyAlbums()
  const albumEditor = useAlbumEditor()
  const table = useManageTable({
    items: albums.data,
    compare: COMPARE,
    defaultSort: '-created',
    filterParams: FILTER_PARAMS,
    matches,
    what: NOUN[1],
  })
  const { selected } = table
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  // What the confirm is about: the ticked albums (the bar) or one row's (its ⋯)
  const [deleting, setDeleting] = useState<AlbumSummary[] | null>(null)
  const [didDeleteFail, setDidDeleteFail] = useState(false)
  const deleteAlbums = useDeleteAlbums()
  const shareAlbums = useShareAlbums()

  // Edit tracks starts from the whole album (its tracks, and who it's shared with)
  const editTracks = async (id: string) => {
    try {
      const { album, tracks } = await fetchWholeAlbum(id)
      albumEditor.editTracks(album, async () => tracks)
    } catch {
      sileo.error({ title: "Couldn't open the album", description: 'Please try again.' })
    }
  }

  const columns = (isCompact: boolean): TableColumn<AlbumSummary>[] => [
    {
      key: 'name',
      header: 'Album',
      sortable: true,
      width: proportional(4, { minWidth: 200 }),
      renderCell: (album) => (
        <NameCell
          href={albumPath(album)}
          name={album.name}
          imageUrl={album.imageUrl}
          imageBgColor={album.imageBgColor}
          isLiked={album.likedByMe}
        />
      ),
    },
    { key: 'tracks', header: 'Tracks', sortable: true, width: pixel(96), align: 'end', renderCell: (album) => album.trackCount },
    ...(isCompact
      ? []
      : [
          {
            key: 'length',
            header: 'Length',
            sortable: true,
            width: pixel(130),
            align: 'end' as const,
            renderCell: (album: AlbumSummary) => (album.totalDurationSeconds > 0 ? formatLength(album.totalDurationSeconds) : '–'),
          },
          {
            key: 'created',
            header: 'Created',
            sortable: true,
            width: pixel(190),
            renderCell: (album: AlbumSummary) => formatDate(album.createdAt),
          },
        ]),
    {
      key: 'actions',
      header: '',
      width: pixel(104),
      align: 'end',
      renderCell: (album) => (
        <HStack gap={1} hAlign="end" vAlign="center">
          <IconButton
            label={`Edit ${album.name}`}
            variant="ghost"
            icon={<Icon icon={PencilIcon} color="secondary" />}
            onClick={() => setEditingId(album.id)}
          />
          <DropdownMenu
            alignment="end"
            renderTrigger={(props) => (
              <IconButton
                {...props}
                label={`More options for ${album.name}`}
                variant="ghost"
                icon={<Icon icon={EllipsisHorizontalIcon} color="secondary" />}
              />
            )}
            items={[
              { label: 'Go to album', icon: ArrowTopRightOnSquareIcon, href: albumPath(album) },
              { label: 'Edit tracks', icon: Bars3BottomLeftIcon, onClick: () => void editTracks(album.id) },
              { type: 'divider' },
              { label: 'Delete album', icon: TrashIcon, variant: 'destructive', onClick: () => setDeleting([album]) },
            ]}
          />
        </HStack>
      ),
    },
  ]

  const confirmDelete = async () => {
    if (!deleting) return
    setDidDeleteFail(false)
    const result = await deleteAlbums.mutateAsync(deleting.map((album) => album.id))
    // Nothing went: say so in the dialog, which stays open (a toast would sit behind it)
    if (result.done.length === 0) {
      setDidDeleteFail(true)
      return
    }
    setDeleting(null)
    // Ticked albums that weren't part of this stay ticked; of those that were, the failed ones
    const gone = new Set(result.done)
    table.keepSelected(selected.map((album) => album.id).filter((id) => !gone.has(id)))
    reportBulk(result, { did: 'Deleted', couldnt: 'delete', noun: NOUN })
  }

  return (
    <ManagePage
      tab="albums"
      title="Your albums"
      noun={NOUN}
      status={albums.status}
      onRetry={() => void albums.refetch()}
      empty={{ title: 'No albums yet', description: 'Group your tracks into an album to share them together.' }}
      table={table}
      columns={columns}
      sortLabels={SORT_LABELS}
      actions={
        <Button label="New album" variant="primary" size="lg" icon={<Icon icon={PlusIcon} />} onClick={() => albumEditor.create()} />
      }
      filters={
        <>
          <FilterToggle table={table} param="tracks" on="none" label="No tracks" icon={InboxIcon} />
          <FilterSelector table={table} param="created" label="Created" options={CREATED} />
        </>
      }
      bulk={({ isIconOnly, isDisabled }) => (
        <>
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
            onClick={() => setDeleting(selected)}
          />
        </>
      )}
    >
      {editingId && <EditAlbum key={editingId} id={editingId} onClose={() => setEditingId(null)} />}
      <BulkShareDialog
        count={selected.length}
        noun={NOUN}
        share={(add, caption) => shareAlbums.mutateAsync({ ids: selected.map((album) => album.id), add, caption })}
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
        isOpen={deleting !== null}
        onOpenChange={(open) => {
          if (open) return
          setDeleting(null)
          setDidDeleteFail(false)
        }}
        title={deleting?.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting?.length ?? 0} albums?`}
        description={
          didDeleteFail
            ? "Couldn't delete. Check your connection and try again."
            : "They go for good, and the people you shared them with lose access to their tracks (unless you've shared a track with them directly). The tracks themselves stay in your library."
        }
        actionLabel="Delete"
        actionVariant="destructive"
        isActionLoading={deleteAlbums.isPending}
        onAction={confirmDelete}
      />
    </ManagePage>
  )
}

// Edit details wants the whole album (its description and URL), which rows don't carry:
// fetched when the pencil is pressed, the dialog opening once it's here
function EditAlbum({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useAlbumDetail(id)
  const update = useUpdateAlbum(id)
  const [didReport, setDidReport] = useState(false)
  if (detail.isError && !didReport) {
    setDidReport(true)
    sileo.error({ title: "Couldn't open the album", description: 'Please try again.' })
    onClose()
  }
  const album = detail.data?.pages[0]?.album
  if (!album) return null
  return (
    <EditDetailsDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Edit album"
      initial={{ name: album.name, description: album.description ?? '' }}
      cover={{ imageUrl: album.imageUrl, imageBgColor: album.imageBgColor }}
      url={album.slug && album.owner ? { pathPrefix: `/${album.owner.username}/albums/`, slug: album.slug } : undefined}
      isSaving={update.isPending}
      onSave={(details) => update.mutateAsync(details)}
    />
  )
}
