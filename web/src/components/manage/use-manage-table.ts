import {
  useTablePagination,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  type TableSortState,
} from '@astryxdesign/core/Table'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

// The state behind a manage table (Your tracks / albums / playlists): everything is loaded
// up front, so search, filters, sorting by any column and pages all run in the browser.
// Where you are lives in the address — ?q=, ?sort= (`name` A–Z, `-name` Z–A; absent = the
// default), ?page= and each screen's own filter params — so Back and a refresh keep it.
// Ticked rows stay ticked across pages, searches and filters; select-all covers what's
// matched, not just the page. A screen can pin rows of another kind above the rest (Your
// tracks' uploads still on their way): first on page one whatever the sort, hidden by any
// filter but the search, never ticked or counted.

export const PAGE_SIZES = [25, 50, 100]

type Row = Record<string, unknown> & { id: string; name: string }
type Compare<T> = (a: T, b: T) => number

export function useManageTable<T extends Row, K extends string, P extends Row = never>({
  items,
  pinned,
  compare,
  defaultSort,
  filterParams,
  matches,
  what,
}: {
  /** Every row; undefined while loading. */
  items: T[] | undefined
  /** Rows to pin above the rest (one already among `items` is left out). */
  pinned?: P[]
  /** Ascending comparators, by ?sort= key (the sortable columns' keys). */
  compare: Record<K, Compare<T>>
  /** e.g. `-created`: newest first. */
  defaultSort: K | `-${K}`
  /** The screen's own filter params (besides ?q=). */
  filterParams: string[]
  /** Whether a row passes those filters. */
  matches: (item: T, params: URLSearchParams, now: number) => boolean
  /** "tracks": names the pager for screen readers. */
  what: string
}) {
  const [params, setParams] = useSearchParams()
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  /** Sets (or, with null, drops) address params without adding a history entry. */
  const setParam = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )

  const query = params.get('q') ?? ''
  const isFiltered = Boolean(query.trim()) || filterParams.some((key) => params.has(key))
  const sortParam = params.get('sort') ?? ''
  const isKnownSort = (sortParam.startsWith('-') ? sortParam.slice(1) : sortParam) in compare
  const sortValue = (isKnownSort ? sortParam : defaultSort) as K | `-${K}`
  const isDescending = sortValue.startsWith('-')
  const sortKey = (isDescending ? sortValue.slice(1) : sortValue) as K
  const setSortValue = (value: string) => setParam({ sort: value === defaultSort ? null : value, page: null })

  const paramString = params.toString()
  const { shown, selected } = useMemo(() => {
    const by = compare[sortKey]
    const sorted = [...(items ?? [])].sort((a, b) => (isDescending ? by(b, a) : by(a, b)))
    const needle = query.trim().toLowerCase()
    const now = Date.now()
    return {
      shown: sorted.filter(
        (item) => (!needle || item.name.toLowerCase().includes(needle)) && matches(item, params, now),
      ),
      // In the order the table shows them, whatever page, search or filter they're on
      selected: sorted.filter((item) => selectedKeys.has(item.id)),
    }
    // The address is what changes; `compare` and `matches` are each screen's constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, paramString, selectedKeys])

  const pinnedShown = useMemo(() => {
    const ids = new Set((items ?? []).map((item) => item.id))
    const needle = query.trim().toLowerCase()
    const hasFilter = filterParams.some((key) => params.has(key))
    return (pinned ?? []).filter(
      (row) => !ids.has(row.id) && !hasFilter && (!needle || row.name.toLowerCase().includes(needle)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pinned, paramString])
  const pinnedIds = new Set(pinnedShown.map((row) => row.id))

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Number(params.get('page')) || 1))
  const goToPage = (next: number) => setParam({ page: next > 1 ? String(next) : null })

  const { selectionConfig, selectionState } = useTableSelectionState<T | P>({
    data: [...pinnedShown, ...shown],
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
    getIsItemSelectable: (item) => !pinnedIds.has(item.id),
  })
  const selection = useTableSelection<T | P>({ ...selectionConfig, getRowLabel: (item) => item.name })
  const sort: TableSortState<K> = [{ sortKey, direction: isDescending ? 'descending' : 'ascending' }]
  const sortable = useTableSortable<T | P, K>({
    sort,
    onSortChange: ([next]) =>
      setSortValue(next ? `${next.direction === 'descending' ? '-' : ''}${next.sortKey}` : defaultSort),
  })
  const pagination = useTablePagination<T | P>({
    page,
    onPageChange: goToPage,
    totalItems: shown.length,
    pageSize,
    pageSizeOptions: PAGE_SIZES,
    onPageSizeChange: (size) => {
      setPageSize(size)
      setParam({ page: null })
    },
    variant: 'count',
    align: 'center',
    label: `Pages of your ${what}`,
  })

  return {
    what,
    params,
    setParam,
    query,
    isFiltered,
    clearFilters: () => setParam(Object.fromEntries(['q', 'page', ...filterParams].map((key) => [key, null]))),
    sortValue,
    setSortValue,
    total: items?.length ?? 0,
    /** Every row that passes the search and filters, sorted. */
    shown,
    /** The pinned rows showing (on page one, above the rest). */
    pinned: pinnedShown,
    pageRows: [...(page === 1 ? pinnedShown : []), ...shown.slice((page - 1) * pageSize, page * pageSize)],
    page,
    pageCount,
    pageSize,
    goToPage,
    /** The ticked rows, in table order. */
    selected,
    clearSelection: selectionState.clearSelection,
    /** After a bulk action: what failed stays ticked, to try again. */
    keepSelected: (ids: string[]) => setSelectedKeys(new Set(ids)),
    plugins: { selection, sortable, pagination },
  }
}

export type ManageTable<T extends Row, P extends Row = never> = ReturnType<typeof useManageTable<T, string, P>>
