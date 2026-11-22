const { contextBridge, ipcRenderer } = require('electron')

const INVOKE = new Set(['app:init', 'auth:login', 'auth:answer', 'auth:cancel', 'auth:logout', 'models:list', 'projects:choose', 'projects:set', 'projects:recent', 'threads:list', 'threads:open', 'notes:list', 'notes:read', 'files:pick', 'run:start', 'run:abort', 'run:guide', 'approval:answer', 'settings:update'])
const EVENTS = new Set(['auth:event', 'models:changed', 'thread:event', 'thread:session', 'thread:title', 'threads:changed', 'app:close-tab'])

contextBridge.exposeInMainWorld('suffice', {
  platform: process.platform,
  async invoke(channel, args) {
    if (!INVOKE.has(channel)) throw new Error(`Unknown channel ${channel}`)
    const result = await ipcRenderer.invoke(channel, args)
    if (!result.ok) throw new Error(result.error)
    return result.value
  },
  on(channel, listener) {
    if (!EVENTS.has(channel)) throw new Error(`Unknown event ${channel}`)
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
})
