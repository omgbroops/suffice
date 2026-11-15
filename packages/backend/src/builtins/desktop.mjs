// Built-in desktop (computer use) tool: drives the agent-desktop CLI, one --session per agent.
// Verified against https://github.com/vercel-labs/agent-desktop and https://agent-browser.dev/desktop/{commands,json-output,snapshots-and-refs}:
//   install: npm install -g agent-desktop (or brew install agent-desktop); `version` and `status` are commands;
//   snapshot --app <name> -i [--max-depth N] [--root <ref>]; click <ref>; refs look like @s<id>:e<n> (bare @e8 is INVALID_ARGS);
//   JSON envelope {version, ok, command, data|error:{code,message,...}}; snapshot data {app, snapshot_id, ref_count, tree};
//   error codes include STALE_REF; exit 0 ok, 1 structured error, 2 parse error.
// UNVERIFIED (docs only say "use <command> --help"): exact argv for list-apps, type <ref> <text>, press <combo>,
//   scroll <ref> --direction <dir>, focus-window --app <name>, screenshot --app <name> <path>; position of --session;
//   whether tree nodes store ref_id bare or qualified (both handled); how secure fields are marked
//   (heuristic: states/role matching secure|password|protected, or a name containing password/passcode).
import { createCliTool, sessionName } from './cli-tool.mjs';

export const DESKTOP_INSTALL = 'npm install -g agent-desktop (or: brew install agent-desktop), then grant Accessibility access';
// Names match by substring, entries containing a dot (bundle ids) by prefix; all case-insensitive.
export const DEFAULT_DENY = [
  '1password', 'bitwarden', 'keychain', 'lastpass', 'dashlane', 'keepassxc', 'enpass',
  'system settings', 'system preferences', 'security', 'privacy',
  'terminal', 'iterm', 'warp', 'ghostty', 'alacritty', 'kitty', 'wezterm', 'powershell', 'cmd.exe',
  'suffice',
  'com.apple.systempreferences', 'com.apple.terminal', 'com.googlecode.iterm2', 'com.1password', 'com.bitwarden', 'com.apple.keychainaccess',
];
const REF = /^@s[a-z0-9]+:e\d+$/;
const SECURE = /secure|password|protected/i;

export function createDesktop({ exec, clock, policy = {}, approve, onAction, decide } = {}) {
  const tool = createCliTool({ exec, binary: 'agent-desktop', clock, installHint: DESKTOP_INSTALL, alwaysJson: true, versionArgs: ['version'] });
  const allowed = (policy.allowedApps ?? []).map((a) => String(a).toLowerCase());
  const auto = (policy.autoApprove ?? []).map((a) => String(a).toLowerCase());
  const deny = [...(policy.deny ?? DEFAULT_DENY), ...(policy.denyExtra ?? [])].map((d) => String(d).toLowerCase());
  const { max = 60, windowMs = 60000 } = policy.rateLimit ?? {};
  const now = () => clock?.now?.() ?? Date.now();
  const agents = new Map();
  const ag = (id) => { let a = agents.get(id); if (!a) agents.set(id, (a = { refs: new Map(), lastApp: null, approved: new Map(), hits: [] })); return a; };

  const refuse = (reason, error) => ({ ok: false, code: null, data: null, text: '', error, reason });
  const denied = (app) => { const a = app.toLowerCase(); return deny.some((d) => (d.includes('.') && !d.includes(' ') ? a.startsWith(d) : a.includes(d))); };
  const appCheck = (app) => {
    if (typeof app !== 'string' || !app || app.startsWith('-')) return refuse('invalid_arg', 'app name required');
    if (denied(app)) return refuse('policy', `app is on the denylist: ${app}`);
    if (!allowed.includes(app.toLowerCase())) return refuse('policy', `app not allowed: ${app}`);
    return null;
  };
  const report = (agentId, action, app, target, extra, ok) => {
    try { onAction?.({ agentId, tool: 'desktop', app: app ?? null, action, target: target ?? null, ...extra, at: now(), ok }); } catch { /* observer errors never block a tool */ }
  };

  const run = (agentId, args) => tool.run(args, { session: sessionName(agentId) });
  const wrap = (r) => (r.ok ? r : { ...r, reason: r.errorCode === 'not_installed' ? 'not_installed' : r.errorCode === 'STALE_REF' ? 'stale_ref' : 'cli' });
  const dropApp = (a, app) => { for (const [k, v] of a.refs) if (v.app === app) a.refs.delete(k); };

  function limited(a) {
    const t = now();
    a.hits = a.hits.filter((h) => t - h < windowMs);
    if (a.hits.length >= max) return true;
    a.hits.push(t);
    return false;
  }

  async function approved(agentId, a, app, action, target) {
    if (auto.includes(app.toLowerCase())) return true;
    const key = app.toLowerCase();
    if (!a.approved.has(key)) {
      const p = (async () => { try { return (await approve?.({ agentId, app, action, target })) === true; } catch { return false; } })();
      a.approved.set(key, p);
      if (!(await p)) a.approved.delete(key); // a denial is not remembered; the next try asks again
      return p;
    }
    return a.approved.get(key);
  }

  // Shared path for click/type/scroll (ref-based) and key (app-based).
  async function mutate(agentId, action, { ref, app: appIn, args, length, secureCheck, afterOk }) {
    const a = ag(agentId);
    let app = appIn;
    let target = ref ?? args.at(-1);
    let res;
    if (ref !== undefined) {
      if (!REF.test(String(ref))) res = refuse('invalid_ref', `invalid ref: ${ref} (expected @s<id>:e<n>)`);
      else if (!a.refs.has(ref)) res = refuse('stale_ref', `stale_ref: ${ref} is not in the current snapshot; take a new snapshot first`);
      else app = a.refs.get(ref).app;
    } else if (!app) res = refuse('no_app', 'no app in focus; snapshot or focus an app first');
    if (!res) res = appCheck(app);
    if (!res && secureCheck && a.refs.get(ref).secure) res = refuse('policy', 'refusing to type into a secure field');
    if (!res) { // a decision can only deny; allow, ask and errors fall through to the first-touch approval
      let v = null;
      try { v = await decide?.('action.approve', { tool: 'desktop', action, target: String(target ?? ''), app }, { agentId }); } catch { /* falls through */ }
      if (v?.decision === 'deny') res = refuse('denied', `denied by decision: ${v.reason ?? 'no reason'}`);
    }
    if (!res && !(await approved(agentId, a, app, action, target))) res = refuse('denied', `approval denied for ${app}`);
    if (!res && limited(a)) res = refuse('rate_limited', `rate limit: ${max} actions per ${windowMs} ms`);
    if (!res) {
      res = wrap(await run(agentId, args));
      if (res.ok) afterOk?.(a, app);
      else if (res.reason === 'stale_ref') dropApp(a, app);
    }
    report(agentId, action, app, target, length === undefined ? {} : { length }, res.ok);
    return res;
  }

  function walk(node, id, app, a, secureOf) {
    if (!node || typeof node !== 'object') return;
    const raw = node.ref_id ?? node.ref;
    if (typeof raw === 'string') {
      const ref = raw.startsWith('@') ? raw : /^s[a-z0-9]+:e\d+$/.test(raw) ? `@${raw}` : `@${id}:${raw}`;
      const states = Array.isArray(node.states) ? node.states.join(' ') : '';
      a.refs.set(ref, { app, secure: SECURE.test(states) || SECURE.test(String(node.role ?? '')) || /password|passcode/i.test(String(node.name ?? '')) });
    }
    for (const c of node.children ?? []) walk(c, id, app, a, secureOf);
  }

  return {
    doctor: () => tool.doctor(),
    apps: async (agentId) => { const r = wrap(await run(agentId, ['list-apps'])); report(agentId, 'apps', null, null, {}, r.ok); return r; },
    snapshot: async (agentId, app, { root, depth } = {}) => {
      let r = appCheck(app);
      if (!r && root !== undefined && !REF.test(String(root))) r = refuse('invalid_ref', `invalid root ref: ${root}`);
      if (!r && limited(ag(agentId))) r = refuse('rate_limited', `rate limit: ${max} actions per ${windowMs} ms`);
      if (!r) {
        const args = ['snapshot', '--app', app, '-i'];
        if (Number.isInteger(depth) && depth > 0) args.push('--max-depth', String(Math.min(depth, 50)));
        if (root !== undefined) args.push('--root', root);
        r = wrap(await run(agentId, args));
        const d = r.data;
        if (r.ok && d?.tree) {
          const a = ag(agentId);
          if (root === undefined) dropApp(a, app);
          walk(d.tree, d.snapshot_id, app, a);
          a.lastApp = app;
        }
      }
      report(agentId, 'snapshot', app, root ?? null, {}, r.ok);
      return r;
    },
    click: (agentId, ref) => mutate(agentId, 'click', { ref, args: ['click', ref], afterOk: (a, app) => dropApp(a, app) }),
    type: (agentId, ref, text) => mutate(agentId, 'type', { ref, args: ['type', ref, String(text)], length: String(text ?? '').length, secureCheck: true }),
    scroll: (agentId, ref, dir) => (['up', 'down', 'left', 'right'].includes(dir)
      ? mutate(agentId, 'scroll', { ref, args: ['scroll', ref, '--direction', dir] })
      : Promise.resolve(refuse('invalid_arg', 'direction must be up, down, left or right'))),
    key: (agentId, combo) => (typeof combo === 'string' && combo && !combo.startsWith('-')
      ? mutate(agentId, 'key', { app: ag(agentId).lastApp, args: ['press', combo] })
      : Promise.resolve(refuse('invalid_arg', 'bad key combo'))),
    focus: async (agentId, app) => {
      let r = appCheck(app);
      if (!r) { r = wrap(await run(agentId, ['focus-window', '--app', app])); if (r.ok) ag(agentId).lastApp = app; }
      report(agentId, 'focus', app, null, {}, r.ok);
      return r;
    },
    screenshot: async (agentId, app, path) => {
      let r = appCheck(app);
      if (!r && (typeof path !== 'string' || !path || path.startsWith('-'))) r = refuse('invalid_arg', 'bad path');
      if (!r) r = wrap(await run(agentId, ['screenshot', '--app', app, path]));
      report(agentId, 'screenshot', app, null, {}, r.ok);
      return r;
    },
  };
}
