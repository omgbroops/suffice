// Starts the renderer's Vite server, then Electron pointed at it.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ configFile: resolve(root, 'vite.config.mjs') })
await server.listen()
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5199/'
const electron = createRequire(import.meta.url)('electron')
// Hosts that are themselves Electron apps can leak this into child processes.
const env = { ...process.env, SUFFICE_DESKTOP_DEV_URL: url }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [root], { stdio: 'inherit', env })
const stop = async code => {
  await server.close()
  process.exit(code ?? 0)
}
child.on('exit', code => void stop(code))
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
