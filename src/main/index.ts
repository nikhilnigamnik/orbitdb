import { app, shell, BrowserWindow, globalShortcut, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { safeExternalUrl } from './app/open-external'
import { registerIpcHandlers } from './ipc'
import { disconnectAll } from './db/manager'

const APP_NAME = 'OrbitDB'
app.setName(APP_NAME)

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
    const isRendererUrl = url.startsWith('file://') || url === process.env['ELECTRON_RENDERER_URL']
    if (isRendererUrl) return
    event.preventDefault()
    const safe = safeExternalUrl(url)
    if (safe) void shell.openExternal(safe)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

  globalShortcut.register('CommandOrControl+Option+I', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.toggleDevTools()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
