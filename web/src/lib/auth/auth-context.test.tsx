import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderHookWithProviders } from '@/testing/providers'
import { useAuth, useUsername } from './auth-context'

describe('useAuth / useUsername', () => {
  it('needs the AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside <AuthProvider>')
  })

  it('gives the signed-in username', () => {
    const { result } = renderHookWithProviders(() => useUsername(), { username: 'oisin' })
    expect(result.current).toBe('oisin')
  })

  it('refuses to give a username while signed out', () => {
    expect(() => renderHookWithProviders(() => useUsername(), { username: null })).toThrow(
      'useUsername called while signed out',
    )
  })
})
