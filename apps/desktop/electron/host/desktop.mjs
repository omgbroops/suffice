// Desktop-side behaviour kept free of Electron imports so tests can drive it with fakes.
import { readdir, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Notification decisions: a finished run or an approval request while the window is not focused. */
export function createNotifier({ getSettings, isFocused, show }) {
  return (channel, payload) => {
    if (channel !== 'thread:event' || isFocused()) return
    const e = payload?.event
    const n = getSettings().notify ?? {}
    const silent = n.sound !== true
    if (e?.type === 'approval' && n.needsInput !== false) show({ title: 'Suffice needs you', body: 'A task is waiting for your approval.', silent })
    else if (e?.type === 'end' && n.done !== false && (e.ok || e.error !== 'Stopped.')) show({ title: e.ok ? 'Task done' : 'Task stopped', body: e.ok ? 'A task finished.' : String(e.error ?? 'The run failed.').slice(0, 120), silent })
  }
}

export const applyLoginItem = (app, s) => { if (typeof s?.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: s.openAtLogin }) }

const fsReal = { readdir, rm, stat }
/** Delete files older than `days` under each dir (recursively); days 0 keeps everything. Returns the count removed. */
export async function pruneOld(dirs, days, { now = Date.now(), fs = fsReal } = {}) {
  if (!(days > 0)) return 0
  const cutoff = now - days * 86_400_000
  let removed = 0
  const walk = async dir => {
    for (const f of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = resolve(dir, f.name)
      if (f.isDirectory()) await walk(p)
      else if ((await fs.stat(p).catch(() => null))?.mtimeMs < cutoff) (await fs.rm(p, { force: true }), removed++)
    }
  }
  for (const d of dirs) await walk(d)
  return removed
}

/** Remove everything inside each dir but keep the dirs themselves. */
export async function clearDirs(dirs, { fs = fsReal } = {}) {
  for (const d of dirs) for (const f of await fs.readdir(d).catch(() => [])) await fs.rm(resolve(d, f), { recursive: true, force: true })
}
