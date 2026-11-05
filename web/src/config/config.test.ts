import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('aws-amplify')
})

describe('env', () => {
  it('reads the VITE_ settings', async () => {
    const { env } = await import('./env')
    expect(env).toEqual({
      apiBaseUrl: 'http://api.test',
      cognitoClientId: 'test-client',
      cognitoUserPoolId: 'eu-west-1_test',
      awsRegion: 'eu-west-1',
    })
  })

  it('fails fast at startup when one is missing', async () => {
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', '')
    await expect(import('./env')).rejects.toThrow('Missing required environment variable: VITE_COGNITO_CLIENT_ID')
  })
})

describe('configureAmplify', () => {
  it('configures Cognito (username or email sign-in) exactly once', async () => {
    const configure = vi.fn()
    vi.doMock('aws-amplify', () => ({ Amplify: { configure } }))
    const { configureAmplify } = await import('@/lib/auth/amplify')

    configureAmplify()
    configureAmplify()

    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'eu-west-1_test',
          userPoolClientId: 'test-client',
          loginWith: { username: true, email: true },
        },
      },
    })
  })
})

describe('queryClient defaults', () => {
  it("doesn't refetch on focus by default, retries once, and keeps data fresh for a minute", async () => {
    const { queryClient } = await import('@/lib/react-query')
    expect(queryClient.getDefaultOptions().queries).toMatchObject({ refetchOnWindowFocus: false, retry: 1, staleTime: 60_000 })
  })
})
