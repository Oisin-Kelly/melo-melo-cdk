import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { GENRES } from '@/config/genres'
import { LIMITS } from '@/config/limits'
import { CountedTextInput } from './counted-text-input'

// Genre: pick one from the list (searchable), or "Other…" to type your own into a field
// that appears under it. Still one free-text value — a saved genre that isn't on the list
// opens with Other picked and the text in the field.

const OTHER = 'other'
const OPTIONS = [...GENRES.map((genre) => ({ value: genre, label: genre })), { value: OTHER, label: 'Other…' }]

/** The list's own spelling of `value`, if it's on the list. */
const listed = (value: string) => GENRES.find((genre) => genre.toLowerCase() === value.trim().toLowerCase())

export function GenreField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error: string | null
}) {
  const [isOther, setIsOther] = useState(() => value.trim() !== '' && !listed(value))
  const status = error ? ({ type: 'error', message: error } as const) : undefined

  return (
    <VStack gap={2}>
      <Selector
        label="Genre"
        isOptional
        placeholder="Choose a genre"
        options={OPTIONS}
        hasSearch
        searchPlaceholder="Search genres"
        hasClear
        value={isOther ? OTHER : (listed(value) ?? null)}
        onChange={(picked) => {
          setIsOther(picked === OTHER)
          // Other starts from an empty field (or what was typed before); clearing means none
          if (picked !== OTHER) onChange(picked ?? '')
          else if (listed(value)) onChange('')
        }}
      />
      {isOther && (
        <CountedTextInput
          label="Your genre"
          maxLength={LIMITS.genre}
          value={value}
          onChange={onChange}
          hasAutoFocus
          status={status}
        />
      )}
    </VStack>
  )
}
