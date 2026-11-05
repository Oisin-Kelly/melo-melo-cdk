import { useInfiniteQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaginatedResult } from '@/types/api'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import { InfiniteList } from './infinite-list'

afterEach(() => vi.unstubAllGlobals())

type Item = { id: string }

function List({ filter }: { filter?: (item: Item) => boolean }) {
  const query = useInfiniteQuery({
    queryKey: ['items'],
    queryFn: async ({ pageParam }) => {
      const res = await fetch(`${API}/items${pageParam ? `?cursor=${pageParam}` : ''}`)
      if (!res.ok) throw new Error('failed')
      return (await res.json()) as PaginatedResult<Item>
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  })
  return (
    <InfiniteList
      query={query}
      getKey={(item) => item.id}
      renderItem={(item) => <p>Item {item.id}</p>}
      empty={{ title: 'Nothing here yet' }}
      filter={filter}
      noMatch="No one matches"
    />
  )
}

/** pages: cursor (or '') → that page. */
function servePages(pages: Record<string, PaginatedResult<Item> | 'error'>) {
  const asked: string[] = []
  server.use(
    http.get(`${API}/items`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor') ?? ''
      asked.push(cursor)
      const page = pages[cursor]
      return page === 'error' ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(page)
    }),
  )
  return asked
}

describe('InfiniteList', () => {
  it('renders the rows, and says when it has reached the end', async () => {
    servePages({ '': { items: [{ id: '1' }, { id: '2' }], nextCursor: null } })
    renderWithProviders(<List />)

    expect(await screen.findByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText("You've reached the bottom")).toBeInTheDocument()
  })

  it('is empty only when the first page is empty and there is no cursor', async () => {
    servePages({ '': { items: [], nextCursor: null } })
    renderWithProviders(<List />)
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
  })

  it('keeps pulling past empty pages that still have a cursor (rows dropped server-side)', async () => {
    const asked = servePages({
      '': { items: [], nextCursor: 'a' },
      a: { items: [], nextCursor: 'b' },
      b: { items: [{ id: 'late' }], nextCursor: null },
    })
    renderWithProviders(<List />)

    expect(await screen.findByText('Item late')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument()
    expect(asked).toEqual(['', 'a', 'b'])
  })

  it('shows an error with a retry when the first page fails', async () => {
    let fail = true
    server.use(
      http.get(`${API}/items`, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ items: [{ id: 'ok' }], nextCursor: null }),
      ),
    )
    renderWithProviders(<List />)
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument()

    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Item ok')).toBeInTheDocument()
  })

  it('loads the next page at the end of the list; if that fails, keeps the rows and offers a retry', async () => {
    // The end-of-list marker is always "in view", so reaching it is immediate
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        private callback: (entries: { isIntersecting: boolean }[]) => void
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          this.callback = callback
        }
        observe() {
          this.callback([{ isIntersecting: true }])
        }
        disconnect() {}
      },
    )
    const pages: Record<string, PaginatedResult<Item> | 'error'> = {
      '': { items: [{ id: '1' }], nextCursor: 'two' },
      two: 'error',
    }
    servePages(pages)
    renderWithProviders(<List />)

    expect(await screen.findByText("Couldn't load more.")).toBeInTheDocument()
    expect(screen.getByText('Item 1')).toBeInTheDocument()

    pages.two = { items: [{ id: '2' }], nextCursor: null }
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText("You've reached the bottom")).toBeInTheDocument()
  })

  it('filters what is loaded, saying so when nothing matches', async () => {
    servePages({ '': { items: [{ id: 'ada' }, { id: 'grace' }], nextCursor: null } })
    const { rerender } = renderWithProviders(<List filter={(item) => item.id.startsWith('g')} />)

    expect(await screen.findByText('Item grace')).toBeInTheDocument()
    expect(screen.queryByText('Item ada')).not.toBeInTheDocument()

    rerender(<List filter={() => false} />)
    expect(screen.getByText('No one matches')).toBeInTheDocument()
  })
})
