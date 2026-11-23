import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { account, githubAccount, githubLogin, githubProfile, gitIdentity } from '../electron/host/git.mjs'
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

test('footer account: GitHub first, else the git name; only a GitHub answer is cached', async () => {
  assert.deepEqual(await account(async () => null, async () => 'Ada L'), { name: 'Ada L', avatar: '' })
  // the miss above was not cached, so a later GitHub sign-in shows up; that answer then sticks
  assert.deepEqual(await account(async () => ({ login: 'ada', avatar: '' }), async () => 'Ada L'), { name: '@ada', avatar: '' })
  assert.deepEqual(await account(async () => null, async () => 'other'), { name: '@ada', avatar: '' })
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

test('github profile: counts and the last 182 days from the GraphQL answer; null on junk', async () => {
  const weeks = Array.from({ length: 53 }, (_, w) => ({ contributionDays: Array.from({ length: 7 }, (_, d) => ({ contributionCount: w * 7 + d })) }))
  const viewer = { login: 'octocat', name: 'Mona', avatarUrl: 'https://avatars.githubusercontent.com/u/1', createdAt: '2011-01-25T18:44:36Z', repositories: { totalCount: 8 }, followers: { totalCount: 9 }, contributionsCollection: { contributionCalendar: { totalContributions: 963, weeks } } }
  const p = await githubProfile(async () => ({ data: { viewer } }), async () => 'data:img')
  assert.deepEqual({ ...p, days: undefined }, { login: 'octocat', name: 'Mona', avatar: 'data:img', since: '2011', repos: 8, followers: 9, total: 963, days: undefined })
  assert.equal(p.days.length, 182)
  assert.equal(p.days.at(-1), 53 * 7 - 1)
  assert.equal(await githubProfile(async () => null), null)
  assert.equal(await githubProfile(async () => ({ data: { viewer: { ...viewer, login: 'bad login!' } } })), null)
})
