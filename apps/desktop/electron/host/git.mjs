import { execFile } from 'node:child_process'

const gitGet = key => new Promise(res => execFile('git', ['config', '--global', key], { timeout: 3000 }, (err, out) => res(err ? '' : String(out).trim())))

/** The user's git name; else the local part of their email; else a prompt to set git up. `get` is injectable for tests. */
export async function gitIdentity(get = gitGet) {
  const name = await get('user.name')
  if (name) return name
  const email = await get('user.email')
  return email.split('@')[0] || 'Git not set up'
}
