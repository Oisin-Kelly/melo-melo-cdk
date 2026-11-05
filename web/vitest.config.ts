import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Unit tests: Vitest + jsdom + Testing Library, with the network mocked by MSW (src/testing/server.ts).
// The app's own Vite config is reused so the `@/` alias and the React plugin match the build.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/testing/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // config/env.ts throws at import if any of these is missing; fixed fakes, never .env.local
      env: {
        VITE_API_BASE_URL: 'http://api.test',
        VITE_COGNITO_CLIENT_ID: 'test-client',
        VITE_COGNITO_USER_POOL_ID: 'eu-west-1_test',
        VITE_AWS_REGION: 'eu-west-1',
      },
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**', 'src/themes/built/**', 'src/main.tsx'],
      },
    },
  }),
)
