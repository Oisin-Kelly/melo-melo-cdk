import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { sileo } from 'sileo'
import { describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@/config/limits'
import { ApiError } from '@/lib/api-client'
import { userSummary } from '@/testing/fixtures'
import { expectMessage, fieldErrors, fieldMessage } from '@/testing/messages'
import { renderWithProviders } from '@/testing/providers'
import { API, server } from '@/testing/server'
import type { Recipient, ShareChange } from '@/types/api'
import { ShareDialog } from './share-dialog'

const recipient = (username: string, displayName: string | null = null): Recipient => ({
  user: userSummary(username, { displayName }),
  sharedAt: Date.now() - 60_000,
})

type Outcome = 'ok' | ApiError | Error

function setup({ people = [] as Recipient[], recipientsState = 'ok' as 'ok' | 'pending' | 'error', outcome = 'ok' as Outcome } = {}) {
  const refetch = vi.fn()
  const recipients = {
    data: recipientsState === 'ok' ? people : undefined,
    isPending: recipientsState === 'pending',
    isError: recipientsState === 'error',
    refetch,
  } as unknown as UseQueryResult<Recipient[]>
  const mutate = vi.fn((_change: ShareChange, callbacks: { onSuccess: () => void; onError: (e: Error) => void }) =>
    outcome === 'ok' ? callbacks.onSuccess() : callbacks.onError(outcome),
  )
  const share = { mutate, isPending: false } as unknown as UseMutationResult<unknown, Error, ShareChange>
  const onOpenChange = vi.fn()

  renderWithProviders(
    <ShareDialog
      isOpen
      onOpenChange={onOpenChange}
      name="Summer Demos"
      kind="album"
      subtitle="They can play every track in it."
      recipients={recipients}
      share={share}
    />,
    { username: 'me' },
  )
  return { mutate, onOpenChange, refetch, user: userEvent.setup() }
}

/** People search answers with these users (the caller included, to check it's left out). */
function servePeople(...usernames: string[]) {
  server.use(
    http.get(`${API}/users/search`, () => HttpResponse.json({ items: usernames.map((u) => userSummary(u)), nextCursor: null })),
  )
}

async function pick(user: ReturnType<typeof userEvent.setup>, query: string, username: string) {
  await user.type(screen.getByRole('combobox', { name: 'Add people' }), query)
  await user.click(await screen.findByRole('option', { name: new RegExp(username) }))
}

describe('ShareDialog', () => {
  it('starts with nothing to save', () => {
    setup()
    expect(screen.getByText('Only you, so far.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('finds people by username (never yourself) and shares with them and a caption in one save', async () => {
    servePeople('me', 'bob', 'bobby')
    const { mutate, onOpenChange, user } = setup()

    await user.type(screen.getByRole('combobox', { name: 'Add people' }), 'bo')
    expect(await screen.findByRole('option', { name: /bobby/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^me/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /^bob\b/ }))
    await user.type(screen.getByLabelText(/Caption/), 'For the drive')
    await user.click(screen.getByRole('button', { name: 'Share with 1' }))

    expect(mutate).toHaveBeenCalledWith({ add: ['bob'], remove: [], caption: 'For the drive' }, expect.anything())
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Album shared', description: 'Summer Demos' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('marks someone to lose access (with Undo) and only removes them on save', async () => {
    const { mutate, user } = setup({ people: [recipient('bob', 'Bob'), recipient('eve', 'Eve')] })

    await user.click(screen.getByRole('button', { name: "Remove Bob's access" }))
    expect(screen.getByText('Will lose access')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText('Will lose access')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Remove Eve's access" }))
    await user.click(screen.getByRole('button', { name: 'Remove 1' }))

    expect(mutate).toHaveBeenCalledWith({ add: [], remove: ['eve'], caption: '' }, expect.anything())
    expect(sileo.success).toHaveBeenCalledWith({ title: 'Access removed', description: 'Summer Demos' })
  })

  it('names both halves on the button when adding and removing together', async () => {
    servePeople('carol')
    const { user } = setup({ people: [recipient('bob', 'Bob')] })

    await pick(user, 'ca', 'carol')
    await user.click(screen.getByRole('button', { name: "Remove Bob's access" }))

    expect(screen.getByRole('button', { name: 'Share with 1 · Remove 1' })).toBeEnabled()
  })

  it('picking someone marked to lose access keeps them instead', async () => {
    servePeople('bob')
    const { user } = setup({ people: [recipient('bob', 'Bob')] })
    await user.click(screen.getByRole('button', { name: "Remove Bob's access" }))

    await pick(user, 'bo', 'bob')

    expect(screen.queryByText('Will lose access')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share with 1' })).toBeInTheDocument()
  })

  it('shows a too-long caption under the caption and blocks sharing', async () => {
    servePeople('bob')
    const { mutate, user } = setup()
    await pick(user, 'bo', 'bob')

    await user.click(screen.getByLabelText(/Caption/))
    await user.paste('x'.repeat(LIMITS.caption + 1))

    expect(fieldMessage(/Caption/)).toBe(`Keep it to ${LIMITS.caption} characters.`)
    expect(fieldErrors()).toEqual([`Keep it to ${LIMITS.caption} characters.`]) // and on no other field
    expect(screen.getByRole('button', { name: 'Share with 1' })).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('says when someone picked already has it (sharing again resurfaces it)', async () => {
    servePeople('bob')
    const { user } = setup({ people: [recipient('bob')] })

    await user.type(screen.getByRole('combobox', { name: 'Add people' }), 'bo')

    expect(await screen.findByText('@bob · has it — sharing again resurfaces it')).toBeInTheDocument()
  })

  it('previews five people with access, with "Show all"', async () => {
    const people = Array.from({ length: 7 }, (_, i) => recipient(`user${i}`, `User ${i}`))
    const { user } = setup({ people })

    expect(screen.getByText('People with access (7)')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Remove User/ })).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Show all 7' }))

    expect(screen.getAllByRole('button', { name: /^Remove User/ })).toHaveLength(7)
  })

  it('adds a filter box past ten people with access', async () => {
    const people = Array.from({ length: 11 }, (_, i) => recipient(`user${i}`, `User ${i}`))
    const { user } = setup({ people })

    await user.type(screen.getByPlaceholderText('Find someone with access'), 'User 10')
    expect(screen.getAllByRole('button', { name: /^Remove User/ })).toHaveLength(1)

    await user.clear(screen.getByPlaceholderText('Find someone with access'))
    await user.type(screen.getByPlaceholderText('Find someone with access'), 'nobody')
    expect(screen.getByText('No one with access matches “nobody”.')).toBeInTheDocument()
  })

  it('shows a spinner while the people-with-access list loads', async () => {
    setup({ recipientsState: 'pending' })
    expect(screen.getByLabelText('Loading people with access')).toBeInTheDocument()
  })

  it('offers a retry when the list fails', async () => {
    const { refetch, user } = setup({ recipientsState: 'error' })
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('asks before throwing away unsaved changes', async () => {
    const { onOpenChange, user } = setup({ people: [recipient('bob', 'Bob')] })
    await user.click(screen.getByRole('button', { name: "Remove Bob's access" }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    const confirm = screen.getByRole('alertdialog', { name: 'Discard changes?' })

    await user.click(within(confirm).getByRole('button', { name: 'Discard' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes straight away with nothing changed', async () => {
    const { onOpenChange, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows the API's 400 message above the form (not on the people field) and stays open", async () => {
    servePeople('bob')
    const rejected = setup({ outcome: new ApiError(400, 'You can share with at most 50 people.', null) })
    await pick(rejected.user, 'bo', 'bob')
    await rejected.user.click(screen.getByRole('button', { name: 'Share with 1' }))
    await vi.waitFor(() => expectMessage('You can share with at most 50 people.'))
    expect(fieldErrors()).toEqual([]) // a banner, not on the people field
    expect(rejected.onOpenChange).not.toHaveBeenCalled()
  })

  it('says so in the dialog when saving fails, and stays open', async () => {
    servePeople('bob')
    const { onOpenChange, user } = setup({ outcome: new Error('network') })
    await pick(user, 'bo', 'bob')
    await user.click(screen.getByRole('button', { name: 'Share with 1' }))

    expect(await screen.findAllByText("Couldn't save your changes. Please try again.")).not.toHaveLength(0)
    expect(sileo.error).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
