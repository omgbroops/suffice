import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updateForwarder } from '../electron/host/host.mjs'

const wait = ms => new Promise(r => setTimeout(r, ms))

test('updates are coalesced, trailing, and dropped once the tool is done', async () => {
  const sent = []
  const f = updateForwarder(u => sent.push(u), 20)
  f.update('a', 'one'); f.update('a', 'one\ntwo'); f.update('a', '')
  await wait(40)
  assert.deepEqual(sent, [{ id: 'a', output: 'one\ntwo' }])
  f.update('a', 'three'); f.done('a')
  await wait(40)
  assert.equal(sent.length, 1)
})
