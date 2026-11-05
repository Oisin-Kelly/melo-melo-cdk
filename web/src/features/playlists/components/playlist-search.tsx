import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { StackItem } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useState, type ReactNode } from 'react'
import './playlist-search.css'

type Props = {
  value: string
  onChange: (value: string) => void
  hasAutoFocus?: boolean
}

// The playlist's search field. Labelled "playlist search": distinct from the header's
// global "Search", and its clear button reads "Clear playlist search" (Astryx prefixes
// the label).
export function PlaylistSearchField({ value, onChange, hasAutoFocus }: Props) {
  return (
    <TextInput
      label="playlist search"
      isLabelHidden
      placeholder="Search this playlist"
      startIcon={MagnifyingGlassIcon}
      value={value}
      onChange={onChange}
      hasClear
      hasAutoFocus={hasAutoFocus}
    />
  )
}

// Wider screens: a magnifier in the header's buttons row that opens into the field,
// and folds back when it's empty and you click away
export function ExpandingSearch({ value, onChange }: Pick<Props, 'value' | 'onChange'>) {
  const [isOpen, setIsOpen] = useState(value !== '')

  if (!isOpen && !value)
    return (
      <IconButton
        label="Search this playlist"
        variant="ghost"
        icon={<Icon icon={MagnifyingGlassIcon} />}
        onClick={() => setIsOpen(true)}
      />
    )

  return (
    <div
      className="mm-inline-search"
      onBlur={(event) => {
        if (!value && !event.currentTarget.contains(event.relatedTarget)) setIsOpen(false)
      }}
    >
      <PlaylistSearchField value={value} onChange={onChange} hasAutoFocus />
    </div>
  )
}

// Phones: the back button's row. Closed, a magnifier and the sort menu at its end; open,
// the search box with Cancel — which clears it and puts the keyboard away (the page hides
// its header while it's open).
export function PhoneSearchRow({
  value,
  onChange,
  isOpen,
  onOpen,
  onCancel,
  sortMenu,
}: Pick<Props, 'value' | 'onChange'> & { isOpen: boolean; onOpen: () => void; onCancel: () => void; sortMenu: ReactNode }) {
  if (!isOpen)
    return (
      <HStack gap={1} vAlign="center" hAlign="end">
        <IconButton label="Search this playlist" variant="ghost" icon={<Icon icon={MagnifyingGlassIcon} />} onClick={onOpen} />
        {sortMenu}
      </HStack>
    )

  return (
    <HStack gap={1} vAlign="center">
      <StackItem size="fill">
        <PlaylistSearchField value={value} onChange={onChange} hasAutoFocus />
      </StackItem>
      {/* static: kept whole, never squeezed by the field beside it */}
      <StackItem size="static">
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
            onCancel()
          }}
        />
      </StackItem>
    </HStack>
  )
}
