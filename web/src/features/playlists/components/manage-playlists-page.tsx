import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Button } from '@astryxdesign/core/Button'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { pixel, proportional, type TableColumn } from '@astryxdesign/core/Table'
import {
  ArrowTopRightOnSquareIcon,
  EllipsisHorizontalIcon,
  InboxIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useMemo, useState } from 'react'
import { EditDetailsDialog } from '@/components/forms/edit-details-dialog'
import { dateOptions, isWithin } from '@/components/manage/manage-filters'
import { FilterSelector, FilterToggle, ManagePage, NameCell } from '@/components/manage/manage-page'
import { useManageTable } from '@/components/manage/use-manage-table'
import { useUsername } from '@/lib/auth/auth-context'
import { reportBulk } from '@/lib/bulk'
import { playlistPath } from '@/lib/links'
import { usePlaylists, type Playlist } from '@/lib/playlists'
import { formatDate, formatLength } from '@/utils/format'
import { useDeletePlaylists, useUpdatePlaylist } from '../api/playlists'
import { CreatePlaylistDialog } from './create-playlist-dialog'

// /playlists — Your playlists: every playlist you've made in one table (the shared manage
// layout: components/manage); Liked tracks isn't one of them — it can't be renamed or
// deleted. Filters: No tracks, when created. Bulk: delete. Per row: the pencil
// edits its details, ⋯ opens or deletes it.

const NOUN = ['playlist', 'playlists'] as const

const COMPARE = {
  name: (a: Playlist, b: Playlist) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  tracks: (a: Playlist, b: Playlist) => a.trackCount - b.trackCount,
  length: (a: Playlist, b: Playlist) => a.totalDurationSeconds - b.totalDurationSeconds,
  created: (a: Playlist, b: Playlist) => a.createdAt - b.createdAt,
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

function matches(playlist: Playlist, params: URLSearchParams, now: number) {
  if (params.get('tracks') === 'none' && playlist.trackCount > 0) return false
  return isWithin(params.get('created'), playlist.createdAt, now)
}

export function ManagePlaylistsPage() {
  const me = useUsername()
  const playlists = usePlaylists()
  const custom = useMemo(() => playlists.data?.filter((playlist) => playlist.type === 'CUSTOM'), [playlists.data])
  const table = useManageTable({
    items: custom,
    compare: COMPARE,
    defaultSort: '-created',
    filterParams: FILTER_PARAMS,
    matches,
    what: NOUN[1],
  })
  const { selected } = table
  const [isCreating, setIsCreating] = useState(false)
  const [editing, setEditing] = useState<Playlist | null>(null)
  // What the confirm is about: the ticked playlists (the bar) or one row's (its ⋯)
  const [deleting, setDeleting] = useState<Playlist[] | null>(null)
  const [didDeleteFail, setDidDeleteFail] = useState(false)
  const deletePlaylists = useDeletePlaylists()

  const columns = (isCompact: boolean): TableColumn<Playlist>[] => [
    {
      key: 'name',
      header: 'Playlist',
      sortable: true,
      width: proportional(4, { minWidth: 200 }),
      renderCell: (playlist) => (
        <NameCell
          href={playlistPath(playlist, me)}
          name={playlist.name}
          imageUrl={playlist.imageUrl}
          imageBgColor={playlist.imageBgColor}
        />
      ),
    },
    { key: 'tracks', header: 'Tracks', sortable: true, width: pixel(96), align: 'end', renderCell: (playlist) => playlist.trackCount },
    ...(isCompact
      ? []
      : [
          {
            key: 'length',
            header: 'Length',
            sortable: true,
            width: pixel(130),
            align: 'end' as const,
            renderCell: (playlist: Playlist) =>
              playlist.totalDurationSeconds > 0 ? formatLength(playlist.totalDurationSeconds) : '–',
          },
          {
            key: 'created',
            header: 'Created',
            sortable: true,
            width: pixel(190),
            renderCell: (playlist: Playlist) => formatDate(playlist.createdAt),
          },
        ]),
    {
      key: 'actions',
      header: '',
      width: pixel(104),
      align: 'end',
      renderCell: (playlist) => (
        <HStack gap={1} hAlign="end" vAlign="center">
          <IconButton
            label={`Edit ${playlist.name}`}
            variant="ghost"
            icon={<Icon icon={PencilIcon} color="secondary" />}
            onClick={() => setEditing(playlist)}
          />
          <DropdownMenu
            alignment="end"
            renderTrigger={(props) => (
              <IconButton
                {...props}
                label={`More options for ${playlist.name}`}
                variant="ghost"
                icon={<Icon icon={EllipsisHorizontalIcon} color="secondary" />}
              />
            )}
            items={[
              { label: 'Go to playlist', icon: ArrowTopRightOnSquareIcon, href: playlistPath(playlist, me) },
              { type: 'divider' },
              { label: 'Delete playlist', icon: TrashIcon, variant: 'destructive', onClick: () => setDeleting([playlist]) },
            ]}
          />
        </HStack>
      ),
    },
  ]

  const confirmDelete = async () => {
    if (!deleting) return
    setDidDeleteFail(false)
    const result = await deletePlaylists.mutateAsync(deleting.map((playlist) => playlist.id))
    // Nothing went: say so in the dialog, which stays open (a toast would sit behind it)
    if (result.done.length === 0) {
      setDidDeleteFail(true)
      return
    }
    setDeleting(null)
    // Ticked playlists that weren't part of this stay ticked; of those that were, the failed ones
    const gone = new Set(result.done)
    table.keepSelected(selected.map((playlist) => playlist.id).filter((id) => !gone.has(id)))
    reportBulk(result, { did: 'Deleted', couldnt: 'delete', noun: NOUN })
  }

  return (
    <ManagePage
      tab="playlists"
      title="Your playlists"
      noun={NOUN}
      status={playlists.status}
      onRetry={() => void playlists.refetch()}
      empty={{ title: 'No playlists yet', description: 'Collect tracks from anywhere in your library into a playlist. Only you can see it.' }}
      table={table}
      columns={columns}
      sortLabels={SORT_LABELS}
      actions={
        <Button label="New playlist" variant="primary" size="lg" icon={<Icon icon={PlusIcon} />} onClick={() => setIsCreating(true)} />
      }
      filters={
        <>
          <FilterToggle table={table} param="tracks" on="none" label="No tracks" icon={InboxIcon} />
          <FilterSelector table={table} param="created" label="Created" options={CREATED} />
        </>
      }
      bulk={({ isIconOnly, isDisabled }) => (
        <Button
          label="Delete"
          variant="destructive"
          icon={<Icon icon={TrashIcon} />}
          isIconOnly={isIconOnly}
          isDisabled={isDisabled}
          onClick={() => setDeleting(selected)}
        />
      )}
    >
      <CreatePlaylistDialog isOpen={isCreating} onOpenChange={setIsCreating} />
      {editing && <EditPlaylist key={editing.id} playlist={editing} me={me} onClose={() => setEditing(null)} />}
      <AlertDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => {
          if (open) return
          setDeleting(null)
          setDidDeleteFail(false)
        }}
        title={deleting?.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting?.length ?? 0} playlists?`}
        description={
          didDeleteFail
            ? "Couldn't delete. Check your connection and try again."
            : "They go for good. The tracks in them aren't affected."
        }
        actionLabel="Delete"
        actionVariant="destructive"
        isActionLoading={deletePlaylists.isPending}
        onAction={confirmDelete}
      />
    </ManagePage>
  )
}

function EditPlaylist({ playlist, me, onClose }: { playlist: Playlist; me: string; onClose: () => void }) {
  const update = useUpdatePlaylist(playlist.id)
  return (
    <EditDetailsDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Edit playlist"
      initial={{ name: playlist.name, description: playlist.description ?? '' }}
      cover={{ imageUrl: playlist.imageUrl, imageBgColor: playlist.imageBgColor }}
      url={playlist.slug ? { pathPrefix: `/${me}/playlists/`, slug: playlist.slug } : undefined}
      isSaving={update.isPending}
      onSave={(details) => update.mutateAsync(details)}
    />
  )
}
