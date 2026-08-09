import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Tests live in tests/, mirroring the src/ layout, rather than beside the code —
// the electron-vite build globs src/ and shouldn't have to exclude specs.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
