// Shared runner for the agent-browser and agent-desktop CLIs. Never throws on a failing command.
// Verified (https://agent-browser.dev/commands, https://agent-browser.dev/desktop/json-output):
//   global flags --session <name> and --json go before the command; desktop JSON envelope
//   {version, ok, command, data|error:{code,message,...}}; exit 0 ok, 1 structured error, 2 parse error.
// Exit 127 is the Exec contract's "binary not found" (src/runner/index.mjs), code 124 = timeout.
// UNVERIFIED: whether the CLIs accept --session placed before the command for desktop.
import { createHash } from 'node:crypto';

export function sessionName(agentId) {
  const id = String(agentId ?? 'default');
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
  return `sf-${slug}-${createHash('sha256').update(id).digest('hex').slice(0, 6)}`;
}

const parse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

export function createCliTool({ exec, binary, clock, installHint, jsonFlag, alwaysJson = false, versionArgs = ['--version'] }) {
  void clock; // kept in the signature so callers inject time the same way everywhere
  const fail = (code, error, errorCode, text = '') => ({ ok: false, code, data: null, text, error, errorCode });

  async function run(args, { timeoutMs, signal, session, json = false } = {}) {
    if (signal?.aborted) return fail(null, 'aborted', 'aborted');
    const argv = [...(session ? ['--session', session] : []), ...(json && jsonFlag ? [jsonFlag] : []), ...args];
    let r;
    try { r = await exec(binary, argv, { timeoutMs }); } catch (e) { return fail(null, String(e?.message ?? e), 'exec_failed'); }
    const text = r.stdout ?? '';
    if (r.code === 127) return fail(127, `${binary} is not installed. Install it with: ${installHint}`, 'not_installed');
    if (r.timedOut || r.code === 124) return fail(r.code, `${binary} timed out`, 'timeout', text);
    const parsed = json || alwaysJson ? parse(text) : undefined;
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
      if (parsed.ok === false) {
        const e = parsed.error ?? {};
        return { ok: false, code: r.code, data: null, text, error: `${e.code ?? 'error'}: ${e.message ?? ''}`.trim(), errorCode: e.code ?? 'error' };
      }
      if (r.code === 0) return { ok: true, code: 0, data: parsed.data ?? null, text, error: undefined, errorCode: undefined };
    }
    if (r.code !== 0) return fail(r.code, (r.stderr || text || `exit ${r.code}`).trim(), 'exit', text);
    return { ok: true, code: 0, data: parsed ?? null, text, error: undefined, errorCode: undefined };
  }

  async function doctor() {
    const r = await run(versionArgs, { timeoutMs: 5000 });
    if (r.errorCode === 'not_installed' || r.errorCode === 'exec_failed') return { installed: false, version: null };
    return { installed: true, version: r.ok ? (r.data?.version ?? (r.text.trim().split('\n')[0] || null)) : null };
  }

  return { run, doctor };
}
