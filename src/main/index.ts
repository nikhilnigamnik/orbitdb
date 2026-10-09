import { app, shell, BrowserWindow, nativeImage, session } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { safeExternalUrl } from './app/open-external'
import { registerIpcHandlers } from './ipc'
import { disconnectAll } from './db/manager'
import { applyStoredTheme, windowBackground } from './app/theme'
import { configureNetwork } from './app/network'

const APP_NAME = 'OrbitDB'
app.setName(APP_NAME)
configureNetwork()

/**
 * How long quitting waits for pools to close. `pool.end()` waits for in-flight
 * queries, so a long-running one would otherwise hold the app open forever.
 */
const QUIT_DISCONNECT_TIMEOUT_MS = 3_000

/**
 * The only web permission the renderer uses: `navigator.clipboard.writeText`
 * behind every Copy action. Paste goes through the paste event's own
 * clipboardData, which needs none.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

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

function isPermissionAllowed(permission: string, url: string | undefined): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && url !== undefined && isRendererUrl(url)
}

function restrictPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isPermissionAllowed(permission, webContents.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
    isPermissionAllowed(permission, webContents?.getURL())
  )
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    autoHideMenuBar: true,
    title: APP_NAME,
    backgroundColor: windowBackground(),
    // macOS: the traffic lights sit inside the sidebar's top row, as in Attio's
    // desktop app. The renderer leaves room for them and makes that row, and
    // each page header, the drag handle. Other platforms keep their frame.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : {}),
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
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

  restrictPermissions()
  // Before the window, so its first paint is already in the right theme.
  applyStoredTheme()
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
  // for the pools to serve until one reopens.
  void disconnectAll().catch((err) => console.error('[app] could not close connections', err))
})

/**
 * Closing pools belongs here, not on `window-all-closed`.
 *
 * Electron does not emit `window-all-closed` when the app is quit by
 * `app.quit()` or Cmd+Q, which is the ordinary way to leave the app on macOS -
 * so the cleanup hung off it never ran on the path that needed it most, and
 * live pools were torn down by process exit instead.
 */
let hasClosedConnections = false
let isClosingConnections = false
app.on('before-quit', (event) => {
  if (hasClosedConnections) return
  event.preventDefault()
  if (isClosingConnections) return
  isClosingConnections = true

  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn('[app] connections still closing; quitting without waiting further')
      resolve()
    }, QUIT_DISCONNECT_TIMEOUT_MS)
  })
  const closing = disconnectAll().catch((err) =>
    console.error('[app] could not close connections', err)
  )
  void Promise.race([closing, timeout]).finally(() => {
    clearTimeout(timer)
    hasClosedConnections = true
    app.quit()
  })
})
