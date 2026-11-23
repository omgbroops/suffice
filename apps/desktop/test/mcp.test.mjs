import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Type } from 'typebox'
import { createMcpServer, writeMcpConfig } from '../electron/host/suffice-mcp.mjs'

const T = (name, parameters, execute) => ({ name, parameters, execute })
const ok = v => async () => ({ content: [{ type: 'text', text: JSON.stringify(v) }], structuredContent: v })
function fake(calls = []) {
  const rec = (name, v) => async (_id, args) => { calls.push([name, args]); return ok(v)() }
  return {
    disposed: 0, dispose() { this.disposed++ },
    tools: [
      T('browser_open', Type.Object({ url: Type.String() }, { additionalProperties: false }), rec('browser_open', { ok: true })),
      T('browser_snapshot', Type.Object({}), rec('browser_snapshot', { ok: true })),
      T('desktop_screenshot', Type.Object({}), async () => ({ content: [{ type: 'image', mimeType: 'image/png', data: 'AA==' }], structuredContent: { ok: true } })),
      T('desktop_action', Type.Object({ action: Type.String(), ref: Type.String(), text: Type.Optional(Type.String()) }), rec('desktop_action', { ok: true })),
      T('desktop_press', Type.Object({ key: Type.String(), app: Type.Optional(Type.String()) }), rec('desktop_press', { ok: true })),
      T('desktop_launch', Type.Object({ app: Type.String(), activate: Type.Optional(Type.Boolean()) }), rec('desktop_launch', { ok: false, error: 'nope' })),
    ],
  }
}
const rpc = (s, method, params, id = 1) => s.handle({ jsonrpc: '2.0', id, method, params })
const names = async s => (await rpc(s, 'tools/list')).result.tools.map(t => t.name)

test('initialize, notifications, ping, unknown method', async () => {
  const s = createMcpServer({ capabilities: { browser: true }, automation: fake() })
  const r = await rpc(s, 'initialize', { protocolVersion: '2025-03-26' })
  assert.equal(r.result.protocolVersion, '2025-03-26')
  assert.deepEqual(r.result.capabilities, { tools: {} })
  assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  assert.deepEqual((await rpc(s, 'ping')).result, {})
  assert.equal((await rpc(s, 'nope')).error.code, -32601)
  assert.equal((await s.handle(null)).error.code, -32600)
})

test('tools/list is filtered by capabilities', async () => {
  assert.deepEqual(await names(createMcpServer({ capabilities: {}, automation: fake() })), [])
  const b = await names(createMcpServer({ capabilities: { browser: true }, automation: fake() }))
  assert.ok(b.includes('browser_navigate') && !b.some(n => n.startsWith('computer_')))
  const c = await names(createMcpServer({ capabilities: { computer: true }, automation: fake() }))
  assert.ok(c.includes('computer_screenshot') && !c.some(n => n.startsWith('browser_')))
  const list = (await rpc(createMcpServer({ capabilities: { browser: true }, automation: fake() }), 'tools/list')).result.tools
  assert.equal(list[0].inputSchema.type, 'object')
})

test('tools/call: success, mapping, image, error paths', async () => {
  const calls = []
  const s = createMcpServer({ capabilities: { browser: true, computer: true }, automation: fake(calls), permissions: async () => ({ screen: true, accessibility: true }) })
  const r = await rpc(s, 'tools/call', { name: 'browser_navigate', arguments: { url: 'https://example.com' } })
  assert.equal(r.result.isError, false)
  assert.deepEqual(calls[0], ['browser_open', { url: 'https://example.com' }])
  const bad = await rpc(s, 'tools/call', { name: 'browser_navigate', arguments: { url: 5 } })
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /Invalid arguments/)
  assert.equal((await rpc(s, 'tools/call', { name: 'nope' })).error.code, -32602)
  const img = await rpc(s, 'tools/call', { name: 'computer_screenshot', arguments: {} })
  assert.equal(img.result.content[0].type, 'image')
  await rpc(s, 'tools/call', { name: 'computer_type', arguments: { ref: '@a:e1', text: 'hi' } })
  assert.deepEqual(calls.at(-1), ['desktop_action', { action: 'type', ref: '@a:e1', text: 'hi' }])
  const act = await rpc(s, 'tools/call', { name: 'computer_activate_app', arguments: { app: 'Notes' } })
  assert.deepEqual(calls.at(-1), ['desktop_launch', { app: 'Notes', activate: true }])
  assert.equal(act.result.isError, true) // tool reported ok:false
})

test('a disabled group cannot be called', async () => {
  const s = createMcpServer({ capabilities: { browser: true }, automation: fake() })
  assert.equal((await rpc(s, 'tools/call', { name: 'computer_screenshot', arguments: {} })).error.code, -32602)
})

test('a thrown tool error becomes an isError result', async () => {
  const a = fake(); a.tools[0].execute = async () => { throw new Error('boom') }
  const r = await rpc(createMcpServer({ capabilities: { browser: true }, automation: a }), 'tools/call', { name: 'browser_navigate', arguments: { url: 'x' } })
  assert.deepEqual([r.result.isError, r.result.content[0].text], [true, 'boom'])
})

test('missing macOS permission is a clear error and the action never runs', { skip: process.platform !== 'darwin' }, async () => {
  const calls = []
  const s = createMcpServer({ capabilities: { computer: true }, automation: fake(calls), permissions: async () => ({ screen: false, accessibility: true }) })
  const r = await rpc(s, 'tools/call', { name: 'computer_screenshot', arguments: {} })
  assert.equal(r.result.isError, true); assert.match(r.result.content[0].text, /Screen & System Audio Recording/)
  assert.equal(calls.length, 0)
  const ax = createMcpServer({ capabilities: { computer: true }, automation: fake(calls), permissions: async () => ({ screen: true, accessibility: false }) })
  assert.match((await rpc(ax, 'tools/call', { name: 'computer_key', arguments: { key: 'return', app: 'x' } })).result.content[0].text, /Privacy & Security > Accessibility/)
})

test('config: none enabled -> null; node on PATH; Electron-as-node fallback', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mcp-'))
  assert.equal(await writeMcpConfig({ home, capabilities: { browser: false } }), null)
  const f = await writeMcpConfig({ home, capabilities: { browser: true, computer: 'yes' }, nodePath: '/usr/bin/node', execPath: '/App/Electron', script: '/s.mjs' })
  assert.equal(f, join(home, 'desktop', 'mcp.json'))
  const a = JSON.parse(await readFile(f, 'utf8')).mcpServers.suffice
  assert.deepEqual([a.command, a.args], ['/usr/bin/node', ['/s.mjs']])
  assert.deepEqual(JSON.parse(a.env.SUFFICE_MCP_CAPS), { browser: true, computer: false })
  assert.equal(a.env.ELECTRON_RUN_AS_NODE, undefined)
  await writeMcpConfig({ home, capabilities: { computer: true }, nodePath: null, execPath: '/App/Electron', script: '/s.mjs' })
  const e = JSON.parse(await readFile(f, 'utf8')).mcpServers.suffice
  assert.deepEqual([e.command, e.env.ELECTRON_RUN_AS_NODE], ['/App/Electron', '1'])
})

test('real stdio process answers initialize and tools/list', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mcp-'))
  const p = spawn(process.execPath, [fileURLToPath(new URL('../electron/host/suffice-mcp.mjs', import.meta.url))], { env: { ...process.env, SUFFICE_HOME: home, SUFFICE_MCP_CAPS: '{"browser":true}' } })
  let out = ''; p.stdout.on('data', d => (out += d))
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\nnot json\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  p.stdin.end()
  await new Promise(r => p.on('close', r))
  const lines = out.trim().split('\n').map(l => JSON.parse(l))
  assert.equal(lines.length, 3)
  assert.equal(lines.find(l => l.error)?.error.code, -32700)
  assert.ok(lines.find(l => l.id === 2).result.tools.some(t => t.name === 'browser_navigate'))
})

test('packaged app: a script inside app.asar runs under Electron node mode, never system node', async () => {
  const { writeMcpConfig } = await import('../electron/host/suffice-mcp.mjs')
  const { mkdtemp, readFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const home = await mkdtemp(join(tmpdir(), 'mcp-asar-'))
  try {
    const script = '/Applications/Suffice.app/Contents/Resources/app.asar/apps/desktop/electron/host/suffice-mcp.mjs'
    const file = await writeMcpConfig({ home, capabilities: { browser: true }, execPath: '/Applications/Suffice.app/Contents/MacOS/Suffice', nodePath: '/usr/local/bin/node', script })
    const s = JSON.parse(await readFile(file, 'utf8')).mcpServers.suffice
    assert.equal(s.command, '/Applications/Suffice.app/Contents/MacOS/Suffice')
    assert.equal(s.env.ELECTRON_RUN_AS_NODE, '1')
    const dev = JSON.parse(await readFile(await writeMcpConfig({ home, capabilities: { browser: true }, execPath: '/x/Electron', nodePath: '/usr/local/bin/node', script: '/repo/apps/desktop/electron/host/suffice-mcp.mjs' }), 'utf8')).mcpServers.suffice
    assert.equal(dev.command, '/usr/local/bin/node')
  } finally { await rm(home, { recursive: true, force: true }) }
})
