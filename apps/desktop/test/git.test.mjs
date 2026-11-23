import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { account, githubAccount, githubLogin, gitIdentity } from '../electron/host/git.mjs'
import { findBin } from '../electron/host/accounts.mjs'

const cfg = c => async k => c[k] ?? ''

test('git identity: name, then email local part, then a fallback', async () => {
  assert.equal(await gitIdentity(cfg({ 'user.name': 'Ada L', 'user.email': 'ada@x.io' })), 'Ada L')
  assert.equal(await gitIdentity(cfg({ 'user.email': 'ada@x.io' })), 'ada')
  assert.equal(await gitIdentity(cfg({})), 'Git not set up')
})

test('github account: login + avatar from gh, null when gh is missing or prints junk', async () => {
  const gh = out => async () => out
  assert.deepEqual(await githubAccount(gh('octocat\nhttps://avatars.githubusercontent.com/u/583231?v=4'), async u => 'data:' + u), { login: 'octocat', avatar: 'data:https://avatars.githubusercontent.com/u/583231?v=4' })
  assert.equal(await githubAccount(gh('')), null)
  assert.equal(await githubAccount(gh('not a login!\nx')), null)
})

test('footer account: GitHub first, else the git name', async () => {
  // account() caches per app run, so only the first call is observed here
  assert.deepEqual(await account(async () => null, async () => 'Ada L'), { name: 'Ada L', avatar: '' })
})

test('github login: reads the one-time code from gh output, reports the exit, cancels the child', { skip: !findBin('gh') && 'gh not installed' }, async () => {
  const fake = () => {
    const c = new EventEmitter()
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.killed = false
    c.kill = () => { c.killed = true; c.emit('exit', null) }
    return c
  }
  let child, argv, result
  const login = githubLogin(ok => (result = ok), (bin, args) => ((argv = args), (child = fake())))
  assert.ok(argv.includes('--web') && argv.includes('auth'))
  child.stderr.emit('data', '! One-time code (C9E4-FA8A) copied to clipboard\nOpen this URL')
  assert.equal(await login.code, 'C9E4-FA8A')
  child.emit('exit', 0)
  assert.equal(result, true)
  const two = githubLogin(ok => (result = ok), () => (child = fake()))
  two.cancel()
  assert.equal(child.killed, true)
  assert.equal(result, false)
  await assert.rejects(two.code)
})
