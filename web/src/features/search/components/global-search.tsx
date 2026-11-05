import { Popover } from '@astryxdesign/core/Popover'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { SearchResults } from './search-results'
import './search.css'

export const SEARCH_PLACEHOLDER = 'Search people, tracks, albums and playlists'

// Picking a result is a link navigation, so clear the search whenever the page changes
// (also covers back/forward and nav links clicked while results are open).
function useResetOnNavigate(reset: () => void) {
  const { pathname } = useLocation()
  const resetRef = useRef(reset)
  useEffect(() => {
    resetRef.current = reset
  })
  useEffect(() => {
    resetRef.current()
  }, [pathname])
}

// The header search (desktop): a field centred in the header with grouped results in
// a popover under it. Phones use the Search tab (search-page.tsx) instead.
export function GlobalSearch() {
  const anchorRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const hasQuery = query.trim().length > 0

  const reset = () => {
    setIsOpen(false)
    setQuery('')
  }

  // Opened on the next tick: opening mid-click would let that same click reach the
  // popover's click-outside handler and close it again straight away
  const reopen = () => {
    if (hasQuery) window.setTimeout(() => setIsOpen(true))
  }
  useResetOnNavigate(reset)

  return (
    <div
      ref={anchorRef}
      className="mm-search-field"
      // Coming back to the field (focus or a click) brings the results back for the text
      // still in it; only the input counts, not clicks bubbling up from the results
      onFocus={(e) => e.target instanceof HTMLInputElement && reopen()}
      onClick={(e) => e.target instanceof HTMLInputElement && reopen()}
    >
      <TextInput
        label="Search"
        isLabelHidden
        placeholder={SEARCH_PLACEHOLDER}
        startIcon={MagnifyingGlassIcon}
        value={query}
        hasClear
        width="100%"
        onChange={(value) => {
          setQuery(value)
          setIsOpen(value.trim().length > 0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false)
          if (e.key === 'ArrowDown' && hasQuery) setIsOpen(true)
        }}
      />
      <Popover
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
        isOpen={isOpen && hasQuery}
        onOpenChange={setIsOpen}
        placement="below"
        alignment="start"
        // same width as the field (search.css), so the results line up under it
        width="min(36rem, 42vw)"
        padding={0}
        label="Search results"
        hasAutoFocus={false}
        isModal={false}
        content={
          <div className="mm-search-results">
            <SearchResults query={query} onPicked={reset} />
          </div>
        }
      />
    </div>
  )
}
