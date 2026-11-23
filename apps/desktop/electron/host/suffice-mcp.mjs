// Stdio MCP server (JSON-RPC 2.0, newline-delimited) that gives the user's `claude` CLI the harness's
// browser and desktop tools. Launched by Claude Code from <home>/desktop/mcp.json; also exports the
// protocol core and the config writer so both are testable without a process.
import { accessSync, constants } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Type } from 'typebox'
import { Check, Errors } from 'typebox/value'

const SERVER = { name: 'suffice', version: '0.1.0' }
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SELF = fileURLToPath(import.meta.url)
const str = () => Type.String({ minLength: 1, maxLength: 10000 })

// public name -> harness tool it wraps; `needs` is the macOS permission the action depends on
const TOOLS = [
  { group: 'browser', name: 'browser_navigate', from: 'browser_open', desc: 'Open an http(s) URL in the app\'s managed headless browser. Then read the page.' },
  { group: 'browser', name: 'browser_read_page', from: 'browser_snapshot', desc: 'Read the current page as a compact accessibility tree (headings, links, controls with refs).' },
  { group: 'browser', name: 'browser_get_text', from: 'browser_read', desc: 'Read page text, an input value, the URL or the title.' },
  { group: 'browser', name: 'browser_click', from: 'browser_click', desc: 'Click a selector or a ref from the latest page read.' },
  { group: 'browser', name: 'browser_type', from: 'browser_fill', desc: 'Replace an input\'s value with text. Takes a selector or a ref.' },
  { group: 'browser', name: 'browser_screenshot', from: 'browser_screenshot', desc: 'Screenshot the browser viewport.' },
  { group: 'computer', name: 'computer_screenshot', from: 'desktop_screenshot', needs: 'screen', desc: 'Screenshot the user\'s screen or one app window. Coordinates for computer_click refer to this image.' },
  { group: 'computer', name: 'computer_click', from: 'desktop_click_at', needs: 'accessibility', desc: 'Click absolute screen coordinates taken from a fresh computer_screenshot. Moves the real pointer.' },
  {
    group: 'computer', name: 'computer_type', from: 'desktop_action', needs: 'accessibility', desc: 'Type text into the control with this ref (from computer_snapshot).',
    schema: Type.Object({ ref: Type.String({ pattern: '^@[A-Za-z0-9_-]+:e[0-9]+$' }), text: Type.String({ maxLength: 10000 }) }, { additionalProperties: false }),
    map: a => ({ action: 'type', ...a }),
  },
  { group: 'computer', name: 'computer_snapshot', from: 'desktop_snapshot', needs: 'accessibility', desc: 'Read an app\'s native accessibility controls and their refs.' },
  { group: 'computer', name: 'computer_key', from: 'desktop_press', needs: 'accessibility', desc: 'Press a key or shortcut (for example return, cmd+c) in a named app or window.' },
  { group: 'computer', name: 'computer_apps', from: 'desktop_apps', needs: 'accessibility', desc: 'List running apps, windows or displays.' },
  {
    group: 'computer', name: 'computer_activate_app', from: 'desktop_launch', needs: 'accessibility', desc: 'Launch an app if needed and bring it to the front.',
    schema: Type.Object({ app: str() }, { additionalProperties: false }),
    map: a => ({ ...a, activate: true }),
  },
]

const PERMISSION_HELP = {
  screen: 'Screen recording is not allowed for Suffice. Open System Settings > Privacy & Security > Screen & System Audio Recording, turn on Suffice, then restart Suffice.',
  accessibility: 'Accessibility is not allowed for Suffice. Open System Settings > Privacy & Security > Accessibility, turn on Suffice, then restart Suffice.',
}

/** `agent-desktop status` runs under the same process chain, so its permission report is the one that matters. */
async function statusPermissions(run) {
  const r = await run('desktop', ['status'])
  const p = r?.data?.permissions ?? {}
  return { screen: p.screen_recording?.state === 'granted', accessibility: p.accessibility?.state === 'granted' }
}

/**
 * @param {{ capabilities?: {browser?: boolean, computer?: boolean}, automation?: any, permissions?: () => Promise<{screen: boolean, accessibility: boolean}> }} deps
 * `automation` is a createAutomation() result (or a function returning one); `permissions` is only asked on macOS.
 */
export function createMcpServer({ capabilities = {}, automation, permissions }) {
  const tools = TOOLS.filter(t => capabilities[t.group] === true)
  let auto
  const source = async () => (auto ??= typeof automation === 'function' ? await automation() : automation)

  async function call(params) {
    const t = tools.find(x => x.name === params?.name)
    if (!t) return { error: { code: -32602, message: `Unknown tool: ${params?.name}` } }
    const args = params.arguments ?? {}
    const text = s => ({ result: { content: [{ type: 'text', text: s }], isError: true } })
    try {
      const src = (await source()).tools.find(x => x.name === t.from)
      if (!src) return text(`${t.name} is not available in this build.`)
      const schema = t.schema ?? src.parameters
      if (!Check(schema, args)) return text(`Invalid arguments: ${[...Errors(schema, args)].map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`)
      if (t.needs && process.platform === 'darwin' && permissions) {
        const granted = await permissions()
        if (!granted[t.needs]) return text(PERMISSION_HELP[t.needs])
      }
      const out = await src.execute(params.name, t.map ? t.map(args) : args)
      const failed = out.structuredContent?.ok === false || out.structuredContent?.success === false
      return { result: { content: out.content, isError: failed } }
    } catch (e) {
      return text(e?.message || String(e))
    }
  }

  /** One decoded JSON-RPC message in; the response message out, or null for notifications. */
  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid request' } }
    if (msg.id === undefined) return null
    const reply = o => ({ jsonrpc: '2.0', id: msg.id, ...o })
    switch (msg.method) {
      case 'initialize': {
        const v = msg.params?.protocolVersion
        return reply({ result: { protocolVersion: VERSIONS.includes(v) ? v : VERSIONS[0], capabilities: { tools: {} }, serverInfo: SERVER } })
      }
      case 'ping': return reply({ result: {} })
      case 'tools/list': {
        const list = await Promise.all(tools.map(async t => {
          const src = (await source().catch(() => null))?.tools.find(x => x.name === t.from)
          return { name: t.name, description: t.desc, inputSchema: JSON.parse(JSON.stringify(t.schema ?? src?.parameters ?? { type: 'object' })) }
        }))
        return reply({ result: { tools: list } })
      }
      case 'tools/call': return reply(await call(msg.params))
      default: return reply({ error: { code: -32601, message: `Method not found: ${msg.method}` } })
    }
  }

  return { handle, dispose: async () => { if (auto) await auto.dispose() } }
}

// ---- config for `claude --mcp-config` ------------------------------------

const executable = p => { try { accessSync(p, constants.X_OK); return true } catch { return false } }
export const findNode = (path = process.env.PATH ?? '') => path.split(delimiter).filter(Boolean).map(d => join(d, 'node')).find(executable)

/**
 * Writes <home>/desktop/mcp.json and returns its path, or null when neither group is enabled.
 * Plain `node` when one is on PATH; otherwise the app's own Electron binary as node (a packaged app has no node).
 */
export async function writeMcpConfig({ home, capabilities = {}, execPath = process.execPath, nodePath = findNode(), script = SELF }) {
  const caps = { browser: capabilities.browser === true, computer: capabilities.computer === true }
  if (!caps.browser && !caps.computer) return null
  // a packaged app keeps this script inside app.asar, which only Electron (in node mode) can read; system node cannot
  const node = /\.asar[\\/]/.test(script) ? null : nodePath
  const env = { SUFFICE_HOME: resolve(home), SUFFICE_MCP_CAPS: JSON.stringify(caps), ...(node ? {} : { ELECTRON_RUN_AS_NODE: '1' }) }
  const config = { mcpServers: { suffice: { command: node ?? execPath, args: [script], env } } }
  const dir = resolve(home, 'desktop')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, 'mcp.json')
  await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 })
  return file
}

// ---- process entry --------------------------------------------------------

async function main() {
  const home = process.env.SUFFICE_HOME
  if (!home) { console.error('SUFFICE_HOME is not set.'); process.exit(1) }
  let capabilities = {}
  try { capabilities = JSON.parse(process.env.SUFFICE_MCP_CAPS || '{}') } catch {}
  const load = async () => {
    const { createAutomation, runAutomationProcess } = await import(new URL('../../../../packages/cli/src/automation.mjs', import.meta.url))
    return Object.assign(createAutomation({ home, sessionId: 'claude', headless: true }), { run: runAutomationProcess })
  }
  let run
  const server = createMcpServer({
    capabilities,
    automation: async () => { const a = await load(); run = a.run; return a },
    permissions: async () => statusPermissions(async (k, a) => (run ?? (await load()).run)(k, a)),
  })
  const rl = createInterface({ input: process.stdin })
  let pending = 0, closed = false
  const finish = async () => { if (closed && !pending) { await server.dispose().catch(() => {}); process.exit(0) } }
  rl.on('line', async line => {
    if (!line.trim()) return
    pending++
    let out
    try { out = await server.handle(JSON.parse(line)) } catch (e) { out = e instanceof SyntaxError ? { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } : { jsonrpc: '2.0', id: null, error: { code: -32603, message: String(e?.message ?? e) } } }
    if (out) process.stdout.write(JSON.stringify(out) + '\n')
    pending--
    await finish()
  })
  rl.on('close', () => { closed = true; void finish() })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
