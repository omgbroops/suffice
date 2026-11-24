import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeTheme, Notification, protocol, safeStorage, shell, systemPreferences } from 'electron'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createHost } from './host/host.mjs'
import { inside } from './host/notes.mjs'
import { account, githubLogin, githubProfile } from './host/git.mjs'
import { findBin } from './host/accounts.mjs'
import { cleanArtifactSave } from './host/validate.mjs'
import * as workspace from './host/workspace.mjs'
import { createTerminals } from './host/terminal.mjs'
import { CSP, decodeArtifactUrl } from '../shared/artifacts.mjs'

// Artifacts are served from their own scheme, so the iframe gets a CSP of its own instead of the app's and a separate origin.
protocol.registerSchemesAsPrivileged([{ scheme: 'suffice-artifact', privileges: { standard: true, secure: true } }])
import { createInstaller } from './install.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { applyLoginItem, createNotifier } from './host/desktop.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const devUrl = process.env.SUFFICE_DESKTOP_DEV_URL
let win = null
let host = null

// errors go to <home>/desktop/logs/app.log once the host exists, console before that
const logError = (source, e) => (host ? host.logError(source, e) : void console.error(`[suffice] ${source}`, e))
process.on('uncaughtException', e => logError('main', e))
process.on('unhandledRejection', e => logError('main-rejection', e))

const send = (channel, payload) => win?.webContents.send(channel, payload)
const terminals = createTerminals({ emit: (channel, payload) => send(channel, payload) })
const notifier = createNotifier({
  getSettings: () => host?.getSettings() ?? {},
  isFocused: () => !!win?.isFocused(),
  show: o => { if (Notification.isSupported()) new Notification(o).show() },
})

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#0d0c0a',
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
      // the right panel's browser tab is a <webview>; will-attach-webview below locks every one of them down
      webviewTag: true,
    },
  })
  win.webContents.on('will-attach-webview', (event, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    if (!/^https?:\/\//i.test(params.src)) event.preventDefault()
  })
  win.once('ready-to-show', () => win.show())
  // Cmd/Ctrl+W closes the open tab (the default menu would close the window); on Home the page closes the window itself
  win.webContents.on('before-input-event', (event, i) => {
    if (i.type === 'keyDown' && (process.platform === 'darwin' ? i.meta : i.control) && !i.shift && !i.alt && i.key.toLowerCase() === 'w') {
      event.preventDefault()
      send('app:close-tab')
    }
  })
  win.on('closed', () => { win = null; terminals.dispose() })
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

// First run: a frameless see-through window that floats a setup card over the desktop.
// It owns `win` until 'intro:done' swaps in the main window.
function createIntro() {
  const intro = new BrowserWindow({
    width: 980,
    height: 640,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'Welcome to Suffice',
    webPreferences: { preload: resolve(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  win = intro
  intro.once('ready-to-show', () => intro.show())
  intro.on('closed', () => { if (win === intro) win = null })
  intro.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  intro.webContents.on('will-navigate', event => event.preventDefault())
  if (devUrl) void intro.loadURL(`${devUrl}#intro`)
  else void intro.loadFile(resolve(here, '..', 'dist', 'index.html'), { hash: 'intro' })
}

let ghLogin = null // the one gh device-flow sign-in in flight
const darwin = process.platform === 'darwin'
const PANES = { accessibility: 'Privacy_Accessibility', screen: 'Privacy_ScreenCapture' }
const screenStatus = () => ({
  accessibility: darwin ? systemPreferences.isTrustedAccessibilityClient(false) : true,
  screen: darwin ? systemPreferences.getMediaAccessStatus('screen') === 'granted' : true,
})

// the CSS follows prefers-color-scheme, which Electron derives from themeSource
const applyTheme = s => { if (['system', 'light', 'dark'].includes(s?.theme)) nativeTheme.themeSource = s.theme }

// a project the app has open; the right panel never reads anywhere else
const openProject = async project => {
  if (typeof project !== 'string' || !(await host.recentProjects()).includes(project)) throw new Error('Open that project first.')
  return project
}

const handlers = {
  'workspace:changes': async ({ project, scope, ignoreWhitespace }) => workspace.changes(await openProject(project), { scope, ignoreWhitespace: ignoreWhitespace === true }),
  'workspace:files': async ({ project }) => workspace.files(await openProject(project)),
  'terminal:open': async ({ project, cols, rows }) => terminals.open({ cwd: await openProject(project), cols, rows }),
  'terminal:write': args => terminals.write(args),
  'terminal:resize': args => terminals.resize(args),
  'terminal:close': args => terminals.close(args),
  'workspace:list': async ({ project, dir }) => workspace.list(await openProject(project), dir),
  'workspace:read': async ({ project, path }) => workspace.read(await openProject(project), path),
  'app:init': () => host.init(),
  'git:identity': () => account(),
  'auth:login': () => host.login(),
  'auth:answer': ({ id, value }) => host.answerLogin(id, value),
  'auth:cancel': () => host.cancelLogin(),
  'auth:logout': () => host.logout(),
  'models:list': () => host.models(),
  'projects:choose': () => host.chooseProject(),
  'projects:set': ({ path }) => host.setProject(path),
  'projects:default': () => host.defaultProject(),
  'projects:recent': () => host.recentProjects(),
  'projects:list': () => host.projectsList(),
  'projects:add-folder': args => host.addFolder(args),
  'threads:list': ({ project }) => host.listThreads(project),
  'threads:act': args => host.threadAct(args),
  'threads:open-in': args => host.openIn(args),
  'threads:targets': () => host.openTargets(),
  'notes:list': args => host.listNotes(args),
  // files chosen to mention in a prompt: project-relative when inside the project, absolute otherwise
  'files:pick': async ({ project }) => {
    const r = await dialog.showOpenDialog(win, { title: 'Mention files', defaultPath: typeof project === 'string' && project ? project : undefined, properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return []
    return r.filePaths.map(f => (typeof project === 'string' && project && inside(project, f) ? relative(project, f).split(sep).join('/') : f))
  },
  // writes an artifact into the project folder, at a place the person picks inside it
  'artifacts:save': async a => {
    const { project, name, content } = cleanArtifactSave(a)
    if (!(await host.recentProjects()).includes(project)) throw new Error('Open that project first.')
    const r = await dialog.showSaveDialog(win, { title: 'Save artifact', defaultPath: join(project, name) })
    if (r.canceled || !r.filePath) return null
    if (!inside(project, r.filePath)) throw new Error('Save inside the project folder.')
    await writeFile(r.filePath, content, 'utf8')
    return relative(project, r.filePath).split(sep).join('/')
  },
  'notes:read': args => host.readNote(args),
  'projects:name': args => host.nameProject(args),
  'threads:open': args => host.openThread(args),
  'run:start': args => host.run(args),
  'run:abort': ({ threadId }) => host.abort(threadId),
  'run:guide': args => host.guide(args),
  'approval:answer': ({ id, allow }) => host.answerApproval(id, allow),
  'app:error': ({ message, stack, source }) => {
    const text = v => (typeof v === 'string' ? v.slice(0, 4000) : '')
    return void logError('renderer', `${text(message)}\n${text(stack)} ${text(source)}`)
  },
  'accounts:list': () => host.accountsList(),
  'accounts:key-set': args => host.setKey(args),
  'accounts:key-test': args => host.testKey(args),
  'accounts:key-remove': args => host.removeKey(args),
  'settings:update': async patch => { const s = await host.updateSettings(patch); applyTheme(s); applyLoginItem(app, s); return s },
  'privacy:clear': () => host.clearHistory(),
  'app:info': () => ({ version: app.getVersion(), openAtLogin: app.getLoginItemSettings().openAtLogin }),
  'usage:summary': args => host.usageSummary(args),
  'screen:status': () => screenStatus(),
  'screen:request': async ({ kind }) => {
    if (!Object.hasOwn(PANES, kind)) throw new Error('Unknown permission.')
    if (!darwin) return screenStatus()
    // each call registers Suffice in the list macOS shows; the pane is where the switch lives
    if (kind === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true)
    else await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {})
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${PANES[kind]}`)
    return screenStatus()
  },
  'github:status': async () => {
    const a = await account()
    return { installed: !!findBin('gh'), login: a.name.startsWith('@') ? a.name : null, avatar: a.avatar, waiting: !!ghLogin }
  },
  'github:login': async () => {
    ghLogin?.cancel()
    const login = githubLogin(() => (ghLogin = null))
    if (!login) {
      await shell.openExternal('https://cli.github.com')
      return { installed: false, code: null }
    }
    ghLogin = login
    const code = await login.code
    await shell.openExternal('https://github.com/login/device')
    return { installed: true, code }
  },
  'github:profile': () => githubProfile(),
  'github:cancel': () => void (ghLogin?.cancel(), (ghLogin = null)),
  'intro:done': async () => {
    await host.updateSettings({ onboarded: true })
    const intro = win
    createWindow()
    intro?.close()
  },
}

// pages inside a browser tab stay on http(s) and open their links in the same tab
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void contents.loadURL(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => { if (!/^https?:/i.test(url)) event.preventDefault() })
})

app.whenReady().then(async () => {
  const installer = createInstaller({ app, dialog, exec: promisify(execFile) })
  if (await installer.offerMove()) return // relaunching from /Applications
  // one app per data folder: a second copy would run a second host over the same settings, keys and threads.
  // Taken after offerMove so the copy relaunched from /Applications is never refused by the one leaving.
  if (!app.requestSingleInstanceLock()) return app.quit()
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  void installer.ejectSource()
  host = await createHost({
    safeStorage,
    emit: (channel, payload) => (send(channel, payload), notifier(channel, payload)),
    openExternal: url => void shell.openExternal(url),
    openPath: async dir => { const e = await shell.openPath(dir); if (e) throw new Error(e) },
    openApp: (name, dir) => new Promise((ok, no) => execFile('open', ['-a', name, dir], e => (e ? no(e) : ok()))),
    chooseDirectory: async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Choose a project', properties: ['openDirectory'] })
      return result.canceled ? undefined : result.filePaths[0]
    },
  })
  protocol.handle('suffice-artifact', req => {
    let html
    try { html = decodeArtifactUrl(req.url) } catch { return new Response('Bad artifact', { status: 400 }) }
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP } })
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
  applyTheme(host.getSettings())
  if (host.getSettings().onboarded || process.env.SUFFICE_SKIP_INTRO === '1') createWindow()
  else createIntro()
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})

let quitting = false
app.on('before-quit', event => {
  if (quitting || !host) return
  event.preventDefault()
  quitting = true
  terminals.dispose()
  host.dispose().finally(() => app.quit())
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
