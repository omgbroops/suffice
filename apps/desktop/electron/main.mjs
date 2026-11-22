import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve, sep } from 'node:path'
import { createHost } from './host/host.mjs'
import { inside } from './host/notes.mjs'

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

// the CSS follows prefers-color-scheme, which Electron derives from themeSource
const applyTheme = s => { if (['system', 'light', 'dark'].includes(s?.theme)) nativeTheme.themeSource = s.theme }

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
  'notes:list': args => host.listNotes(args),
  // files chosen to mention in a prompt: project-relative when inside the project, absolute otherwise
  'files:pick': async ({ project }) => {
    const r = await dialog.showOpenDialog(win, { title: 'Mention files', defaultPath: typeof project === 'string' && project ? project : undefined, properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return []
    return r.filePaths.map(f => (typeof project === 'string' && project && inside(project, f) ? relative(project, f).split(sep).join('/') : f))
  },
  'notes:read': args => host.readNote(args),
  'threads:open': args => host.openThread(args),
  'run:start': args => host.run(args),
  'run:abort': ({ threadId }) => host.abort(threadId),
  'run:guide': args => host.guide(args),
  'approval:answer': ({ id, allow }) => host.answerApproval(id, allow),
  'settings:update': async patch => { const s = await host.updateSettings(patch); applyTheme(s); return s },
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
  // before the first paint, so a saved Light or Dark never flashes the system theme
  applyTheme((await host.init().catch(() => null))?.settings)
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
