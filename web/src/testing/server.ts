import { setupServer } from 'msw/node'

// Every test's network. Unhandled requests fail the test (setup.ts), so nothing can reach
// the real API, S3 or Cognito; tests add their own handlers with server.use(...).
export const server = setupServer()

/** The base URL tests run against (vitest.config.ts test.env). */
export const API = 'http://api.test'
