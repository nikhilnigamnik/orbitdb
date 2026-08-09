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
    environment: 'node',
    setupFiles: ['tests/setup/jsdom-polyfills.ts'],
    // Headroom over the Testing Library query timeout above, so a slow render
    // retries rather than failing the test outright.
    testTimeout: 20_000,
    // Date formatting is timezone-sensitive, so pin one — otherwise a spec that
    // passes in +05:30 fails on a UTC runner. Deliberately not UTC: an offset of
    // zero renders as 'Z' and never exercises the offset path.
    env: { TZ: 'Asia/Kolkata' }
  },
  esbuild: {
    jsx: 'automatic'
  }
})
