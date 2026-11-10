import type { InfiniteData, InfiniteQueryObserverResult } from '@tanstack/react-query'

type PagedQuery<Page> = Pick<InfiniteQueryObserverResult<InfiniteData<Page>>, 'data' | 'hasNextPage' | 'isError'> & {
  fetchNextPage: () => Promise<PagedQuery<Page>>
}

/** Every page of an infinite query, fetching the rest first: "Play all" plays the whole
 *  album or playlist, not just the rows scrolled into view so far. */
export async function allPages<Page>(query: PagedQuery<Page>): Promise<Page[]> {
  let result = query
  while (result.hasNextPage && !result.isError) result = await result.fetchNextPage()
  if (result.isError) throw new Error("Couldn't load every page")
  return result.data?.pages ?? []
}
