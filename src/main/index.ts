import { app, shell, BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { safeExternalUrl } from './app/open-external'
import { registerIpcHandlers } from './ipc'
import { disconnectAll } from './db/manager'

const APP_NAME = 'OrbitDB'
app.setName(APP_NAME)

/** The one file the renderer is ever allowed to be. */
const rendererFile = join(__dirname, '../renderer/index.html')

/**
 * Whether a navigation is the app's own renderer rather than somewhere else.
 *
 * A bare `startsWith('file://')` would answer yes to every file on the disk, so
 * the file case resolves the URL to a path and compares it with the bundle we
 * actually loaded. The dev server is matched on origin rather than on a prefix,
 * because `http://localhost:5173.example.com` starts with the dev URL too.
 */
function isRendererUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    try {
      if (parsed.origin === new URL(devUrl).origin) return true
    } catch {
      // A malformed ELECTRON_RENDERER_URL just means there is no dev origin.
    }
  }

  if (parsed.protocol !== 'file:') return false
  try {
    return fileURLToPath(parsed) === rendererFile
  } catch {
    return false
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    title: APP_NAME,
    backgroundColor: '#0e1013',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // A target="_blank" link in rendered content lands here. Without the check
    // it reached the OS handler unvalidated, bypassing the one on the IPC path.
    const safe = safeExternalUrl(details.url)
    if (safe) void shell.openExternal(safe)
    else console.warn('[window] refused to open', details.url)
    return { action: 'deny' }
  })

  // The renderer is a local bundle; navigating it anywhere else is either a bug
  // or an attempt to leave the app inside its own window.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRendererUrl(url)) return
    event.preventDefault()
    const safe = safeExternalUrl(url)
    if (safe) void shell.openExternal(safe)
  })

  // Scoped to this window rather than registered with `globalShortcut`, which
  // would swallow the combination system-wide - the browser the user alt-tabs
  // to would stop opening its own devtools while OrbitDB merely runs.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const isDevToolsKey =
      input.type === 'keyDown' &&
      input.alt &&
      (input.meta || input.control) &&
      input.code === 'KeyI'
    if (isDevToolsKey) mainWindow.webContents.toggleDevTools()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(rendererFile)
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.orbitdb.app')

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Quitting runs the same cleanup through `before-quit`.
    app.quit()
    return
  }
  // macOS keeps the app in the dock with no window, and there is nothing left
  // for the pools and their tunnels to serve until one reopens.
  void disconnectAll().catch((err) => console.error('[app] could not close connections', err))
})

/**
 * Closing pools and tunnels belongs here, not on `window-all-closed`.
 *
 * Electron does not emit `window-all-closed` when the app is quit by
 * `app.quit()` or Cmd+Q, which is the ordinary way to leave the app on macOS -
 * so the cleanup hung off it never ran on the path that needed it most, and
 * live SSH tunnels were torn down by process exit instead.
 */
let hasClosedConnections = false
app.on('before-quit', (event) => {
  if (hasClosedConnections) return
  event.preventDefault()
  void disconnectAll()
    .catch((err) => console.error('[app] could not close connections', err))
    .finally(() => {
      hasClosedConnections = true
      app.quit()
    })
})
