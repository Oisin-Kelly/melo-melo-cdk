import { characterCount } from '@astryxdesign/core/utils'

// What the API actually saves from a text field (api/Adapters/Validation/InputSanitiser.cs),
// so counters and "too long" checks measure that rather than what was typed — spaces
// at the ends, or a run of them in the middle, would otherwise turn a counter red
// ("31/30") for text that fits once saved.

/** Names, genre, profile fields: line breaks become spaces, ends trimmed, runs of spaces collapsed. */
export const singleLine = (value: string) =>
  value
    .replace(/\r?\n/g, ' ')
    .trim()
    .replace(/[^\S\r\n]+/g, ' ')

/** Descriptions, bio, captions: ends trimmed, runs of spaces collapsed, at most one blank line in a row. */
export const multiLine = (value: string) =>
  value
    .trim()
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/(\r?\n){3,}/g, '\n\n')

export type TextKind = 'single' | 'multi'

export const savedLength = (value: string, kind: TextKind = 'single') =>
  characterCount(kind === 'single' ? singleLine(value) : multiLine(value))

/** "Keep it to N characters." once the saved text is past the limit, else null. */
export const lengthError = (value: string, limit: number, kind: TextKind = 'single') =>
  savedLength(value, kind) > limit ? `Keep it to ${limit} characters.` : null
