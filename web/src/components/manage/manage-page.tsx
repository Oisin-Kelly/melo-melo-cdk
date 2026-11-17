import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon, type IconType } from '@astryxdesign/core/Icon'
import { Link } from '@astryxdesign/core/Link'
import { Pagination } from '@astryxdesign/core/Pagination'
import { Selector } from '@astryxdesign/core/Selector'
import { Table, type TableColumn } from '@astryxdesign/core/Table'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { ToggleButton } from '@astryxdesign/core/ToggleButton'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { VStack } from '@astryxdesign/core/VStack'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import type { ReactNode } from 'react'
import { PageLoader } from '@/components/feedback/page-loader'
import type { LoadingWhat } from '@/components/feedback/loading-phrases'
import { Illustration } from '@/components/illustrations/illustration'
import { PageHeader } from '@/components/layout/page-header'
import { SortMenu } from '@/components/lists/sort-menu'
import { CoverArt } from '@/components/media/cover-art'
import { LikedHeart } from '@/components/media/media-rows'
import { useIsCompactDensity } from '@/components/theme/use-display-prefs'
import { useIsCompact } from '@/hooks/use-is-compact'
import { MANAGE_TABS, type ManageTab } from './manage-filters'
import type { ManageTable } from './use-manage-table'
import './manage.css'

// The manage screens — Your tracks (/tracks), Your albums (/albums), Your playlists
// (/playlists) — share one layout, for wider screens only. Top to bottom: the title with
// the count and sort opposite it, tabs between the three, the things you can start from
// here, the filter row, then a bar that's always there — the bulk actions (off until rows
// are ticked, so nothing appears or moves when you tick one) and a small pager at its end
// (the bar's middle is taken by the actions on Your tracks) — over the table, with the full
// pager centred under it. Each feature owns its data, columns, filters and
// actions (features never import each other); this is the frame they fill.


type Row = Record<string, unknown> & { id: string; name: string }

export function ManagePage<T extends Row, P extends Row = never>({
  tab,
  title,
  noun,
  status,
  onRetry,
  empty,
  table,
  columns,
  sortLabels,
  actions,
  filters,
  bulk,
  children,
}: {
  tab: ManageTab
  title: string
  /** [one, many]: "track", "tracks". */
  noun: readonly [string, string]
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  /** Shown instead of the table when you have none at all. */
  empty: { title: string; description: string }
  table: ManageTable<T, P>
  /** Called with whether the screen is narrow (below 1024px), to drop a column. */
  columns: (isCompact: boolean) => TableColumn<T | P>[]
  /** The sort menu's wording for each ?sort= value. */
  sortLabels: Record<string, string>
  /** What you can start from here (Upload track, New album…). */
  actions: ReactNode
  /** The screen's filters, after the search box. */
  filters: ReactNode
  /** The bulk bar's buttons; icon-only when the screen is narrow. */
  bulk: (options: { isIconOnly: boolean; isDisabled: boolean }) => ReactNode
  /** Dialogs. */
  children?: ReactNode
}) {
  const isCompactDensity = useIsCompactDensity()
  // Below 1024px the content area is phone-sized: a column goes and the bar's buttons are
  // icons, so the table never has to scroll sideways
  const isCompact = useIsCompact()
  const count = (n: number) => `${n} ${n === 1 ? noun[0] : noun[1]}`
  const hasSelection = table.selected.length > 0
  // Pinned rows count as having something (a first upload, still processing), not in the count
  const hasRows = status === 'success' && (table.total > 0 || table.pinned.length > 0)

  return (
    <VStack gap={5}>
      <PageHeader
        title={title}
        actions={
          hasRows &&
          table.total > 0 && (
            <>
              <Text weight="semibold">
                {table.isFiltered ? `${table.shown.length} of ${count(table.total)}` : count(table.total)}
              </Text>
              <SortMenu value={table.sortValue} options={sortLabels} onChange={table.setSortValue} />
            </>
          )
        }
      />
      {/* Links, so the three are real pages (Back, open in a new tab); the address picks the tab */}
      <TabList value={tab} onChange={() => {}} hasDivider>
        <Tab value="tracks" label="Tracks" href={MANAGE_TABS.tracks} />
        <Tab value="albums" label="Albums" href={MANAGE_TABS.albums} />
        <Tab value="playlists" label="Playlists" href={MANAGE_TABS.playlists} />
      </TabList>

      {status === 'pending' && <PageLoader compact what={noun[1] as LoadingWhat} />}

      {status === 'error' && (
        <EmptyState
          icon={<Illustration name="lost" />}
          title={`Couldn't load your ${noun[1]}`}
          description="Check your connection and try again."
          actions={<Button label="Try again" onClick={onRetry} />}
        />
      )}

      {status === 'success' && !hasRows && (
        <EmptyState icon={<Illustration name="music" />} title={empty.title} description={empty.description} actions={actions} />
      )}

      {hasRows && (
        <>
          <HStack gap={3} wrap="wrap">
            {actions}
          </HStack>

          <HStack gap={2} vAlign="center" wrap="wrap">
            <span className="mm-manage-search">
              <TextInput
                label={`Search your ${noun[1]}`}
                isLabelHidden
                placeholder={`Search your ${noun[1]}`}
                startIcon={MagnifyingGlassIcon}
                value={table.query}
                onChange={(value) => table.setParam({ q: value || null, page: null })}
                hasClear
              />
            </span>
            {filters}
            {table.isFiltered && <Button label="Clear filters" variant="ghost" onClick={table.clearFilters} />}
          </HStack>

          <div className="mm-manage-table">
            {/* Always here, so ticking a row never moves the table: off until something's ticked */}
            <Toolbar
              label={`Selected ${noun[1]}`}
              variant="muted"
              size="sm"
              startContent={bulk({ isIconOnly: isCompact, isDisabled: !hasSelection })}
              endContent={
                <>
                  {hasSelection && (
                    <>
                      <Text>{table.selected.length} selected</Text>
                      <Button label="Unselect all" variant="ghost" onClick={table.clearSelection} />
                    </>
                  )}
                  {table.pageCount > 1 && (
                    <Pagination
                      page={table.page}
                      onChange={table.goToPage}
                      totalItems={table.shown.length}
                      pageSize={table.pageSize}
                      variant="compact"
                      size="sm"
                      label={`Pages of your ${noun[1]} (top)`}
                    />
                  )}
                </>
              }
            />
            {table.pageRows.length === 0 ? (
              <EmptyState
                isCompact
                icon={<Illustration name="searching" size="sm" />}
                title={`No ${noun[1]} match`}
                description={
                  table.query.trim()
                    ? `Nothing matches “${table.query.trim()}” with these filters.`
                    : 'Nothing matches these filters.'
                }
              />
            ) : (
              <Table
                data={table.pageRows}
                columns={columns(isCompact)}
                idKey="id"
                hasHover
                textOverflow="truncate"
                density={isCompactDensity ? 'compact' : 'balanced'}
                rowIndexStart={table.page === 1 ? 1 : (table.page - 1) * table.pageSize + 1 + table.pinned.length}
                rowCount={table.shown.length + table.pinned.length}
                plugins={table.plugins}
              />
            )}
          </div>
        </>
      )}

      {children}
    </VStack>
  )
}

/** A table's first cell: cover and name on one line, the name a link ending in "…". */
export function NameCell({
  href,
  name,
  imageUrl,
  imageBgColor,
  isLiked = false,
}: {
  href: string
  name: string
  imageUrl: string | null
  imageBgColor: string | null
  isLiked?: boolean
}) {
  return (
    <span className="mm-manage-cell">
      <CoverArt imageUrl={imageUrl} imageBgColor={imageBgColor} size="sm" />
      <Link href={href} color="primary" className="mm-manage-cell-name">
        {name}
      </Link>
      {isLiked && <LikedHeart size="sm" label="Liked" />}
    </span>
  )
}

// ---- filters: each one is a param in the address, dropped when it's off ----

type AnyTable = Pick<ManageTable<Row>, 'params' | 'setParam'>

/** An on/off filter (No tracks): ?{param}={on} while pressed. */
export function FilterToggle({
  table,
  param,
  on = '1',
  label,
  icon,
}: {
  table: AnyTable
  param: string
  on?: string
  label: string
  icon: IconType
}) {
  return (
    <ToggleButton
      label={label}
      icon={<Icon icon={icon} />}
      isPressed={table.params.get(param) === on}
      onPressedChange={(isPressed) => table.setParam({ [param]: isPressed ? on : null, page: null })}
    >
      {label}
    </ToggleButton>
  )
}

/** A pick-one filter: its first option is "any" (no param). */
export function FilterSelector({
  table,
  param,
  label,
  options,
}: {
  table: AnyTable
  param: string
  label: string
  options: { value: string; label: string }[]
}) {
  const current = table.params.get(param)
  return (
    <Selector
      label={label}
      isLabelHidden
      options={options}
      value={options.some((option) => option.value === current) ? current! : options[0].value}
      onChange={(value) => table.setParam({ [param]: value === options[0].value ? null : value, page: null })}
    />
  )
}
