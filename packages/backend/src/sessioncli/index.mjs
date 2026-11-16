// `sessions` command group. packages/cli has its own toolchain (Node 24, pi deps, single-purpose parseOptions),
// so this lives beside the backend it drives. All I/O is injected so tests never touch tmux.
import os from 'node:os';
import { parseArgs } from 'node:util';
import { spawn as nodeSpawn } from 'node:child_process';

export const USAGE = `usage: sessions <command>
  new <agent> [--cwd DIR] [--detach] [-- extra args]
  ls [--json]
  attach [id|prefix]
  send <id> <text...>
  stop <id>
  screen <id>
  history [--agent A] [--cwd DIR] [--json]
  resume <agent> <sessionId> [--cwd DIR] [--detach]`;

class UsageError extends Error {}
const HISTORY_AGENTS = ['claude', 'codex'];

function age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
const table = (rows) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd()).join('\n');
};

// Resolves to the exit code; never calls process.exit so tests can drive it.
export async function run(argv, { sessions, spawn = nodeSpawn, stdout = process.stdout, stderr = process.stderr, env = process.env, home = os.homedir(), now = Date.now } = {}) {
  const out = (s) => stdout.write(`${s}\n`);
  const err = (s) => stderr.write(`${s}\n`);
  const tilde = (p) => (p && home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p ?? '-');
  // No colour is ever emitted; NO_COLOR / non-TTY need no special casing beyond not adding any.
  const json = (v) => out(JSON.stringify(v));
  const dd = argv.indexOf('--');
  const extra = dd < 0 ? [] : argv.slice(dd + 1);
  const [cmd, ...rest] = dd < 0 ? argv : argv.slice(0, dd);
  const opt = (options) => parseArgs({ args: rest, options: { json: { type: 'boolean' }, ...options }, allowPositionals: true, strict: true });

  const attach = (s) => new Promise((resolve, reject) => {
    const [bin, ...args] = s.attachCommand.split(' ');
    const child = spawn(bin, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
  const resolveId = async (prefix) => {
    const list = await sessions.list();
    if (!prefix) {
      if (list.length === 1) return list[0];
      if (!list.length) throw new Error('no sessions');
      err('several sessions; pass an id:'); err(listText(list)); return null;
    }
    const m = list.filter((s) => s.id.startsWith(prefix));
    if (m.length === 1) return m[0];
    if (!m.length) throw new Error(`no session matches ${prefix}`);
    err(`ambiguous prefix ${prefix}:`); err(listText(m)); return null;
  };
  const listText = (list) => table([['ID', 'AGENT', 'CWD', 'AGE'], ...list.map((s) => [s.id, s.agent ?? '-', tilde(s.cwd), s.created ? age(now() - s.created * 1000) : '-'])]);
  const need = (cond) => { if (!cond) throw new UsageError('missing argument'); };

  try {
    switch (cmd) {
      case 'new': case 'resume': {
        const { values, positionals } = opt({ cwd: { type: 'string' }, detach: { type: 'boolean' } });
        const isNew = cmd === 'new';
        need(positionals.length === (isNew ? 1 : 2));
        const [agent, sessionId] = positionals;
        const cwd = values.cwd ?? process.cwd();
        const s = isNew ? await sessions.start({ agent, cwd, args: extra }) : await sessions.resume({ agent, sessionId, cwd });
        out(s.id);
        return values.detach ? 0 : await attach(s);
      }
      case 'ls': {
        const { values } = opt({});
        const list = await sessions.list();
        if (values.json) json(list); else out(list.length ? listText(list) : 'no sessions');
        return 0;
      }
      case 'attach': {
        const { positionals } = opt({});
        need(positionals.length <= 1);
        const s = await resolveId(positionals[0]);
        return s ? await attach(s) : 2;
      }
      case 'send': {
        const { positionals } = opt({});
        need(positionals.length >= 2);
        const s = await resolveId(positionals[0]);
        if (!s) return 2;
        await sessions.send(s.id, positionals.slice(1).join(' '));
        return 0;
      }
      case 'stop': case 'screen': {
        const { positionals } = opt({});
        need(positionals.length === 1);
        const s = await resolveId(positionals[0]);
        if (!s) return 2;
        if (cmd === 'stop') await sessions.stop(s.id); else out((await sessions.screen(s.id)).text.replace(/\n$/, ''));
        return 0;
      }
      case 'history': {
        const { values } = opt({ agent: { type: 'string' }, cwd: { type: 'string' } });
        const rows = (values.agent ? [values.agent] : HISTORY_AGENTS).flatMap((agent) => sessions.history.list({ agent, cwd: values.cwd }));
        if (values.json) json(rows);
        else out(rows.length ? table([['AGENT', 'SESSION', 'CWD', 'AGE', 'TITLE'], ...rows.map((h) => [h.agent, h.sessionId, tilde(h.cwd), age(now() - h.startedAt), h.title ?? ''])]) : 'no history');
        return 0;
      }
      default:
        throw new UsageError(cmd ? `unknown command ${cmd}` : 'missing command');
    }
  } catch (e) {
    if (e instanceof UsageError || e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      err(`sessions: ${e.message}`); err(USAGE); return 2;
    }
    err(`sessions: ${e.message}`); return 1;
  }
}
