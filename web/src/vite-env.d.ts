/// <reference types="vite/client" />

// Typed access to the app's Vite env vars. Read them through `@/config/env`,
// not import.meta.env directly.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_COGNITO_CLIENT_ID: string
  readonly VITE_AWS_REGION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
