import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `@/…` → src/… — the bulletproof-react import convention. Must stay in
    // sync with the `paths` mapping in tsconfig.app.json.
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
})
