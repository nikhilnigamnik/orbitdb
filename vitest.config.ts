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
    // .tsx specs render components into jsdom via the per-file
    // `@vitest-environment jsdom` pragma; everything else stays on node.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node'
  },
  esbuild: {
    jsx: 'automatic'
  }
})
