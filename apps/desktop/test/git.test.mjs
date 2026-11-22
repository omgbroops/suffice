import test from 'node:test'
import assert from 'node:assert/strict'
import { account, githubAccount, gitIdentity } from '../electron/host/git.mjs'

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
