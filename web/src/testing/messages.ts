import { screen } from '@testing-library/react'
import { expect } from 'vitest'

// Astryx shows a field's error in the field and also announces it through a hidden
// role="alert" region, which fills in a moment later (and keeps the last announcement).
// So a message can briefly be on screen once or twice: assert on the field's own copy.
const visibleCopies = (text: string | RegExp) =>
  screen.queryAllByText(text).filter((el) => el.getAttribute('role') !== 'alert')

export function expectMessage(text: string | RegExp) {
  expect(visibleCopies(text).length, `message "${text}" should be shown`).toBeGreaterThan(0)
}

export function expectNoMessage(text: string | RegExp) {
  expect(visibleCopies(text), `message "${text}" should not be shown`).toHaveLength(0)
}

/** The error a field shows under itself (its aria-describedby status), or null. Use this to check
 *  that a message is on the right field, not just somewhere on screen. */
export function fieldMessage(label: string | RegExp): string | null {
  const input = screen.getByLabelText(label)
  const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  for (const id of ids) {
    const el = document.getElementById(id)
    if (el?.matches('.astryx-field-status[data-type="error"]')) return el.textContent?.trim() || null
  }
  return null
}

/** Every error currently shown under a field, in page order — to check nothing landed on the wrong one. */
export function fieldErrors(): string[] {
  return [...document.querySelectorAll('.astryx-field-status[data-type="error"]')].map((el) => el.textContent?.trim() ?? '')
}
