import { spawn } from 'node:child_process';
import { assertShape } from '../contract.mjs';

const CAP = 1024 * 1024;
const MARKER = '\n[truncated]';
const ZERO = () => ({ inputTokens: 0, outputTokens: 0 });
const realClock = { now: () => Date.now() };
const realTimer = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) };

const toErr = (e) => (e instanceof Error ? e.message : String(e));
const finish = (r, ms) => ({ ...r, usage: { ...ZERO(), ...r.usage }, ms });

/** @returns {import('../contract.mjs').Exec} */
export function createExec({ timer = realTimer } = {}) {
  return (cmd, args = [], opts = {}) => {
    if (typeof cmd !== 'string' || !cmd) throw new TypeError('exec: cmd must be a non-empty string');
    if (!Array.isArray(args)) throw new TypeError('exec: args must be an array');
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, shell: false });
      const out = { stdout: { size: 0, parts: [], cut: false }, stderr: { size: 0, parts: [], cut: false } };
      let timedOut = false, settled = false;
      const collect = (name) => (buf) => {
        const o = out[name];
        const room = CAP - o.size;
        if (room <= 0) { o.cut = true; return; }
        if (buf.length > room) { o.cut = true; buf = buf.subarray(0, room); }
        o.size += buf.length; o.parts.push(buf);
      };
      const text = (o) => Buffer.concat(o.parts).toString('utf8') + (o.cut ? MARKER : '');
      child.stdout.on('data', collect('stdout'));
      child.stderr.on('data', collect('stderr'));
      const timeout = opts.timeoutMs > 0 ? timer.setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, opts.timeoutMs) : null;
      const done = (fn, v) => { if (settled) return; settled = true; if (timeout !== null) timer.clearTimeout(timeout); fn(v); };
      child.on('error', (e) => done(e.code === 'ENOENT' && !opts.cwd ? resolve : reject, e.code === 'ENOENT' && !opts.cwd ? { code: 127, stdout: '', stderr: e.message, timedOut: false } : e));
      child.on('close', (code) => done(resolve, { code: timedOut ? 124 : (code ?? 1), stdout: text(out.stdout), stderr: text(out.stderr), timedOut }));
      child.stdin.on('error', () => {}); // child may exit before reading input
      child.stdin.end(opts.input ?? '');
    });
  };
}

export function createFakeRunner(script) {
  if (typeof script !== 'function' && !Array.isArray(script)) throw new TypeError('createFakeRunner: script must be a function or array');
  const requests = [];
  return {
    requests,
    async run(req) {
      const i = requests.length;
      requests.push(req);
      let r = typeof script === 'function' ? script(req, i) : script[i];
      if (typeof r === 'function') r = r(req, i);
      r = await r;
      if (!r) throw new Error(`fake runner: script exhausted at call ${i + 1}`);
      return finish(r, r.ms ?? 0);
    },
  };
}

// Last parseable JSON object in text: try each '{' from the end through the last '}'.
function lastJsonObject(s) {
  const end = s.lastIndexOf('}') + 1;
  for (let i = s.lastIndexOf('{'); i >= 0; i = s.lastIndexOf('{', i - 1)) {
    try {
      const v = JSON.parse(s.slice(i, end));
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch { /* keep scanning */ }
  }
  return undefined;
}

export function createCommandRunner({ exec, command, args = [], promptVia = 'stdin', timeoutMs, clock = realClock } = {}) {
  if (typeof exec !== 'function') throw new TypeError('createCommandRunner: exec must be a function');
  if (typeof command !== 'string' || !command) throw new TypeError('createCommandRunner: command must be a non-empty string');
  if (!Array.isArray(args)) throw new TypeError('createCommandRunner: args must be an array');
  if (promptVia !== 'stdin' && promptVia !== 'arg') throw new TypeError("createCommandRunner: promptVia must be 'stdin' or 'arg'");
  return {
    async run(req) {
      if (!req || typeof req.prompt !== 'string') throw new TypeError('runner.run: req.prompt must be a string');
      const t0 = clock.now();
      const fail = (error) => finish({ ok: false, error }, clock.now() - t0);
      let r;
      try {
        r = await exec(command, promptVia === 'arg' ? [...args, req.prompt] : args,
          { cwd: req.cwd, timeoutMs, ...(promptVia === 'stdin' ? { input: req.prompt } : {}) });
      } catch (e) { return fail(toErr(e)); }
      if (r.timedOut) return fail(`timed out after ${timeoutMs}ms`);
      if (r.code !== 0) return fail(r.stderr.trim().slice(-2000) || `exit code ${r.code}`);
      const ok = { ok: true, text: r.stdout };
      if (req.schema) {
        const value = lastJsonObject(r.stdout);
        if (!value) return fail('schema: no JSON object in output');
        const key = (req.schema.required ?? []).find((k) => !(k in value));
        if (key !== undefined) return fail(`schema: missing required key "${key}"`);
        ok.value = value;
      }
      return finish(ok, clock.now() - t0);
    },
  };
}

export function createRunnerRegistry({ clock = realClock, timer = realTimer } = {}) {
  const map = new Map();
  return {
    register(name, runner) {
      if (typeof name !== 'string' || !name) throw new TypeError('register: name must be a non-empty string');
      assertShape('runner', runner, ['run']);
      if (map.has(name)) throw new Error(`register: runner "${name}" already registered`);
      map.set(name, runner);
    },
    get(name) {
      if (!map.has(name)) throw new Error(`unknown runner "${name}"`);
      return map.get(name);
    },
    names: () => [...map.keys()].sort(),
    withDefaults(runner, { timeoutMs, retries = 0 } = {}) {
      assertShape('runner', runner, ['run']);
      return {
        async run(req) {
          const t0 = clock.now();
          const end = (r) => finish(r, clock.now() - t0);
          const sig = req?.signal;
          let last = 'failed';
          for (let attempt = 0; attempt <= retries; attempt++) {
            if (sig?.aborted) return end({ ok: false, error: 'aborted' });
            let handle, onAbort;
            const guard = new Promise((resolve) => {
              if (timeoutMs > 0) handle = timer.setTimeout(() => resolve({ timeout: true }), timeoutMs);
              onAbort = () => resolve({ aborted: true });
              sig?.addEventListener('abort', onAbort, { once: true });
            });
            try {
              const r = await Promise.race([runner.run(req), guard]);
              if (r.aborted) return end({ ok: false, error: 'aborted' });
              if (r.timeout) last = `timed out after ${timeoutMs}ms`;
              else return end(r);
            } catch (e) { last = toErr(e); } finally {
              if (handle !== undefined) timer.clearTimeout(handle);
              sig?.removeEventListener('abort', onAbort);
            }
          }
          return end({ ok: false, error: last });
        },
      };
    },
  };
}
