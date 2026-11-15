import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'

/** Back to the previous page when it's ours (the data router numbers its entries in
 *  history.state.idx); on a deep link that would leave the site, to the fallback instead. */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  return () => {
    const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
    void (canGoBack ? navigate(-1) : navigate(fallback, { replace: true }))
  }
}

/** After deleting (or removing) the page's own item: go back like the ← button (or to
 *  `leaveTo`, when the page behind is the item's own — e.g. from its edit page), then drop
 *  the item's detail cache once this page has unmounted — dropping it while still mounted
 *  would refetch it into a 404, and stepping back finishes asynchronously. */
export function useLeaveAfterDelete(detailKey: QueryKey, fallback = '/', leaveTo?: string) {
  const goBack = useGoBack(fallback)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasLeft = useRef(false)
  // A string, so a fresh-but-equal key array each render doesn't re-run the effect
  const key = JSON.stringify(detailKey)

  useEffect(
    () => () => {
      if (hasLeft.current) queryClient.removeQueries({ queryKey: JSON.parse(key) as QueryKey, exact: true })
    },
    [queryClient, key],
  )

  return () => {
    hasLeft.current = true
    if (leaveTo) void navigate(leaveTo, { replace: true })
    else goBack()
  }
}
