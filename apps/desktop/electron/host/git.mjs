import { execFile, spawn } from 'node:child_process'
import { findBin } from './accounts.mjs'

const gitGet = key => new Promise(res => execFile('git', ['config', '--global', key], { timeout: 3000 }, (err, out) => res(err ? '' : String(out).trim())))

/** The user's git name; else the local part of their email; else a prompt to set git up. `get` is injectable for tests. */
export async function gitIdentity(get = gitGet) {
  const name = await get('user.name')
  if (name) return name
  const email = await get('user.email')
  return email.split('@')[0] || 'Git not set up'
}

// Finder-launched apps get only the system PATH, so CLIs resolve through findBin's extra dirs
const run = (cmd, args) => new Promise(res => execFile(findBin(cmd) ?? cmd, args, { timeout: 5000 }, (err, out) => res(err ? '' : String(out).trim())))

/** GitHub avatars as a data URL: the page's CSP only allows self and data: images. Only GitHub's avatar host is fetched. */
async function avatarData(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== 'avatars.githubusercontent.com') return ''
    u.searchParams.set('s', '64')
    const r = await fetch(u, { signal: AbortSignal.timeout(5000) })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return ''
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch {
    return ''
  }
}

/** The signed-in GitHub account from the gh CLI, or null when gh is missing or signed out. */
export async function githubAccount(sh = run, load = avatarData) {
  const [login, avatar] = (await sh('gh', ['api', 'user', '--jq', '.login + "\\n" + .avatar_url'])).split('\n')
  if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return null
  return { login, avatar: avatar ? await load(avatar) : '' }
}

/** Footer account (Abhay 11-22: GitHub avatar + @login; fall back to the git name). Asked once per app run. */
let cached
export function account(gh = githubAccount, git = gitIdentity) {
  return (cached ??= (async () => {
    const a = await gh()
    return a ? { name: '@' + a.login, avatar: a.avatar } : { name: await git(), avatar: '' }
  })())
}

/** Drops the cached account so the next read sees a fresh GitHub sign-in. */
export const resetAccount = () => void (cached = undefined)

/**
 * GitHub sign-in through the gh CLI's device flow: resolves with the one-time code as soon as gh prints it,
 * then calls `done(ok)` when gh exits. `start` is injectable for tests. Returns null when gh is missing.
 */
export function githubLogin(done, start = (bin, args) => spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })) {
  const bin = findBin('gh')
  if (!bin) return null
  const child = start(bin, ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--skip-ssh-key'])
  const code = new Promise((resolve, reject) => {
    let out = ''
    const read = d => {
      out += d
      const m = /code[^A-Z0-9]*([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(out)
      if (m) resolve(m[1])
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', reject)
    child.on('exit', c => {
      reject(new Error(out.trim().split('\n').at(-1) || 'GitHub sign-in stopped.'))
      resetAccount()
      done(c === 0)
    })
  })
  return { code, cancel: () => child.kill() }
}
