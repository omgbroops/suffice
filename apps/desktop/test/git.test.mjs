import test from 'node:test'
import assert from 'node:assert/strict'
import { gitIdentity } from '../electron/host/git.mjs'

const cfg = c => async k => c[k] ?? ''

test('git identity: name, then email local part, then a fallback', async () => {
  assert.equal(await gitIdentity(cfg({ 'user.name': 'Ada L', 'user.email': 'ada@x.io' })), 'Ada L')
  assert.equal(await gitIdentity(cfg({ 'user.email': 'ada@x.io' })), 'ada')
  assert.equal(await gitIdentity(cfg({})), 'Git not set up')
})
