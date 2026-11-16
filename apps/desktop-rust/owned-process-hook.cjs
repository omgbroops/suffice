// Loaded before user Node preloads in the macOS host's owned process tree.
'use strict';
const {ChildProcess} = require('node:child_process');
const Module = require('node:module');
const executable = process.env.SUFFICE_OWNED_EXEC;
const socket = process.env.SUFFICE_OWNED_SOCKET;
if (!executable || !socket) throw new Error('Missing Suffice process guardian');

const mode = '--suffice-owned-exec';
const spawn = ChildProcess.prototype.spawn;
ChildProcess.prototype.spawn = function(options) {
  // Ordinary children inherit their already-registered session. LaunchServices
  // owns GUI applications opened at the user's request.
  if (!options.detached || options.file === '/usr/bin/open') return spawn.call(this, options);
  const envPairs = (options.envPairs || Object.entries(process.env).map(([k,v])=>k+'='+v))
    .filter(entry => !entry.startsWith('SUFFICE_OWNED_SOCKET='));
  envPairs.push('SUFFICE_OWNED_SOCKET='+socket);
  return spawn.call(this, {...options, envPairs, file: executable,
    args: [executable, mode, options.file, ...options.args]});
};

// node-pty creates a fresh session in native code, bypassing ChildProcess.
const load = Module._load;
const ptys = new WeakMap();
Module._load = function(request, ...rest) {
  const result = load.call(this, request, ...rest);
  if (request !== 'node-pty') return result;
  if (!ptys.has(result)) {
    const adapter = Object.create(result);
    for (const key of ['spawn', 'fork', 'createTerminal']) {
      adapter[key] = (file = process.env.SHELL || 'sh', args = [], options = {}) =>
        result[key](executable, [mode, file, file, ...args], {...options,
          env: {...(options.env || process.env), SUFFICE_OWNED_SOCKET:socket}});
    }
    ptys.set(result, adapter);
  }
  return ptys.get(result);
};
