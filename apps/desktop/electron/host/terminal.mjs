// Shells for the right panel's terminal tabs: one pty per tab, started in the project folder.
// node-pty is loaded on first use so the app starts (and tests run) without touching the native module.
import { randomUUID } from 'node:crypto'

const MAX = 8
const size = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d)

export function createTerminals({ emit, env = process.env, platform = process.platform, load = () => import('node-pty') }) {
  const live = new Map()
  const get = id => live.get(id) ?? (() => { throw new Error('That terminal is closed.') })()
  return {
    async open({ cwd, cols, rows }) {
      if (live.size >= MAX) throw new Error(`Close a terminal first (${MAX} are open).`)
      const pty = await load()
      const shell = platform === 'win32' ? 'powershell.exe' : env.SHELL || '/bin/zsh'
      // a login shell: an app started from Finder has only the system PATH
      const child = (pty.default ?? pty).spawn(shell, platform === 'win32' ? [] : ['-l'], {
        name: 'xterm-256color', cwd, cols: size(cols, 2, 500, 80), rows: size(rows, 2, 300, 24),
        env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      })
      const id = randomUUID()
      live.set(id, child)
      child.onData(data => emit('terminal:data', { id, data }))
      child.onExit(() => { live.delete(id); emit('terminal:exit', { id }) })
      return id
    },
    write({ id, data }) {
      if (typeof data !== 'string' || data.length > 1 << 20) throw new Error('Invalid input.')
      get(id).write(data)
    },
    resize({ id, cols, rows }) { get(id).resize(size(cols, 2, 500, 80), size(rows, 2, 300, 24)) },
    close({ id }) { const t = live.get(id); live.delete(id); try { t?.kill() } catch {} },
    dispose() { for (const t of live.values()) try { t.kill() } catch {}; live.clear() },
  }
}
