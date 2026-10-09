import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const PROD_CONNECT_SRC = "connect-src 'self'"
const DEV_CONNECT_SRC = "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"

/**
 * The renderer does all its I/O over IPC, so production allows no connections
 * beyond its own origin. Only the dev server needs more: its HMR websocket.
 * Widening it here, for `serve` alone, keeps the shipped policy tight.
 */
function devServerCsp(): Plugin {
  return {
    name: 'orbitdb:dev-server-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!html.includes(PROD_CONNECT_SRC)) {
        throw new Error(`index.html CSP no longer contains "${PROD_CONNECT_SRC}"`)
      }
      return html.replace(PROD_CONNECT_SRC, DEV_CONNECT_SRC)
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), devServerCsp()],
    build: {
      minify: 'esbuild'
    }
  }
})
