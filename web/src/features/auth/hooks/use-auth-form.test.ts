import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '../api/auth-actions'
import { useAuthForm } from './use-auth-form'

describe('useAuthForm', () => {
  it('blocks the action when a client check fails, showing every failed check', async () => {
    const { result } = renderHook(() => useAuthForm())
    const action = vi.fn(async () => {})

    await act(() => result.current.submit({ username: 'Bad name', password: null, email: 'Bad email' }, action))

    expect(action).not.toHaveBeenCalled()
    expect(result.current.errors).toEqual({ username: 'Bad name', email: 'Bad email' })
    expect(result.current.status('username')).toEqual({ type: 'error', message: 'Bad name' })
    expect(result.current.status('password')).toBeUndefined()
  })

  it('runs the action when every check passes, and is submitting meanwhile', async () => {
    const { result } = renderHook(() => useAuthForm())
    let finish!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))

    let pending!: Promise<void>
    act(() => {
      pending = result.current.submit({ username: null }, action)
    })
    expect(result.current.isSubmitting).toBe(true)

    await act(async () => {
      finish()
      await pending
    })
    expect(action).toHaveBeenCalledTimes(1)
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.errors).toEqual({})
  })

  it("puts an AuthError next to its field", async () => {
    const { result } = renderHook(() => useAuthForm())

    await act(() =>
      result.current.submit({}, async () => {
        throw new AuthError('That code has expired.', 'code')
      }),
    )

    expect(result.current.errors).toEqual({ code: 'That code has expired.' })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('shows any other failure as a generic form error', async () => {
    const { result } = renderHook(() => useAuthForm())

    await act(() =>
      result.current.submit({}, async () => {
        throw new TypeError('boom')
      }),
    )

    expect(result.current.errors).toEqual({ form: 'Something went wrong. Please try again.' })
  })

  it("clear() removes the field's error and the form error, leaving others", async () => {
    const { result } = renderHook(() => useAuthForm())
    await act(() => result.current.submit({ username: 'U', password: 'P' }, async () => {}))

    act(() => result.current.clear('username'))

    expect(result.current.errors).toEqual({ password: 'P' })
  })

  it('clear() keeps the same errors object when there is nothing to clear', async () => {
    const { result } = renderHook(() => useAuthForm())
    await act(() => result.current.submit({ password: 'P' }, async () => {}))
    const before = result.current.errors

    act(() => result.current.clear('username'))

    expect(result.current.errors).toBe(before)
  })
})
