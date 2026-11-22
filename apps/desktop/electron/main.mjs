import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHost } from './host/host.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const devUrl = process.env.SUFFICE_DESKTOP_DEV_URL
let win = null
let host = null

const send = (channel, payload) => win?.webContents.send(channel, payload)

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#0c0c0c',
    title: 'Suffice',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: '#0c0c0c', symbolColor: '#a2a2a2', height: 40 } }),
    webPreferences: {
      preload: resolve(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => (win = null))
  // Links open in the browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(resolve(here, '..', 'dist', 'index.html'))
}

const handlers = {
  'app:init': () => host.init(),
  'auth:login': () => host.login(),
  'auth:answer': ({ id, value }) => host.answerLogin(id, value),
  'auth:cancel': () => host.cancelLogin(),
  'auth:logout': () => host.logout(),
  'models:list': () => host.models(),
  'projects:choose': () => host.chooseProject(),
  'projects:set': ({ path }) => host.setProject(path),
  'projects:recent': () => host.recentProjects(),
  'threads:list': ({ project }) => host.listThreads(project),
  'threads:open': args => host.openThread(args),
  'run:start': args => host.run(args),
  'run:abort': ({ threadId }) => host.abort(threadId),
  'approval:answer': ({ id, allow }) => host.answerApproval(id, allow),
  'settings:update': async patch => {
    const settings = await host.updateSettings(patch)
    applyStartup(settings)
    return settings
  },
  'run:steer': ({ threadId, text, how }) => host.steer(threadId, text, how),
  'resources:list': () => host.resources(),
  'resources:toggle': args => host.toggleResource(args),
  'resources:open': async ({ kind }) => {
    // Only the folders the resources list names, never an arbitrary path.
    const path = (await host.resources()).folders[kind]
    if (!path) throw new Error('Unknown resource folder.')
    return kind === 'mcps' ? shell.openPath(path) : shell.openPath(path).then(error => (error ? shell.showItemInFolder(path) : ''))
  },
  'data:export': async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Export conversations to…', properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled) return null
    const done = await host.exportSessions(result.filePaths[0])
    shell.showItemInFolder(done.directory)
    return done
  },
  'app:about': () => ({ ...host.about(), version: app.getVersion() }),
}

/** Launch at startup follows the preference. Only for the installed app, not dev runs. */
function applyStartup(settings) {
  if (!app.isPackaged) return
  const want = !!settings?.prefs?.startup
  if (app.getLoginItemSettings().openAtLogin !== want) app.setLoginItemSettings({ openAtLogin: want })
}

app.whenReady().then(async () => {
  host = await createHost({
    emit: send,
    openExternal: url => void shell.openExternal(url),
    chooseDirectory: async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Choose a project', properties: ['openDirectory'] })
      return result.canceled ? undefined : result.filePaths[0]
    },
  })
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, args) => {
      try {
        return { ok: true, value: await handler(args ?? {}) }
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) }
      }
    })
  }
  const info = await host.init()
  applyStartup(info.settings)
  void host.expireHistory(path => shell.trashItem(path)).catch(() => {})
  createWindow()
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})

let quitting = false
app.on('before-quit', event => {
  if (quitting || !host) return
  event.preventDefault()
  quitting = true
  host.dispose().finally(() => app.quit())
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
