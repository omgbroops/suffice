// Built-in browser tool: drives the agent-browser CLI, one --session per agent.
// Verified against https://agent-browser.dev/commands, https://agent-browser.dev/security and
// https://github.com/vercel-labs/agent-browser:
//   open <url>; snapshot [-i]; click <@ref>; fill <@ref> <text>; type <@ref> <text>; press <key>;
//   get text <@ref> | get url | get title; wait <selector> | wait <ms> | wait --text <t> | wait --url <p>
//   | wait --load <state> | wait --fn <js>; screenshot [path]; read; tab (list); eval <js>; close;
//   global flag --session <name> before the command; refs print as [ref=e1] and are used as @e1;
//   install: npm install -g agent-browser (then: agent-browser install) or brew install agent-browser.
// UNVERIFIED: `--version` (not documented), `keyboard type <text>` (used for type without a ref),
//   how password fields appear in snapshot text (heuristic match on "password"), whether `--` is accepted.
// Not exposed on purpose: upload, download, --allowed-domains (policy is enforced here before any exec).
import { createCliTool, sessionName } from './cli-tool.mjs';

export const BROWSER_INSTALL = 'npm install -g agent-browser && agent-browser install (or: brew install agent-browser)';
const DENY_SCHEMES = /^(javascript|data|file|chrome|chrome-extension|blob|view-source|ftp|about|vbscript):/i;

export function createBrowser({ exec, clock, policy = {}, onAction } = {}) {
  const tool = createCliTool({ exec, binary: 'agent-browser', clock, installHint: BROWSER_INSTALL, jsonFlag: '--json', versionArgs: ['--version'] });
  const allowed = (policy.allowedDomains ?? []).map((d) => String(d).toLowerCase());
  const states = new Map();
  const st = (id) => { let s = states.get(id); if (!s) states.set(id, (s = { valid: false, refs: new Map(), url: null })); return s; };
  const now = () => clock?.now?.() ?? Date.now();

  const refuse = (reason, error) => ({ ok: false, code: null, data: null, text: '', error, reason });
  const hostOk = (host) => allowed.some((d) => (d.startsWith('.') ? host === d.slice(1) || host.endsWith(d) : host === d));

  function checkUrl(raw) {
    const u = String(raw ?? '').trim();
    if (u === 'about:blank') return { url: u };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && DENY_SCHEMES.test(u)) return { err: refuse('policy', `scheme not allowed: ${u.split(':')[0]}`) };
    let parsed;
    try { parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`); } catch { return { err: refuse('policy', 'invalid url') }; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return { err: refuse('policy', `scheme not allowed: ${parsed.protocol.slice(0, -1)}`) };
    if (parsed.username || parsed.password) return { err: refuse('policy', 'credentials in url not allowed') };
    if (!hostOk(parsed.hostname.toLowerCase())) return { err: refuse('policy', `domain not allowed: ${parsed.hostname}`) };
    return { url: parsed.href };
  }

  const normRef = (ref) => { const m = /^@?(e\d+)$/.exec(String(ref ?? '')); return m ? `@${m[1]}` : null; };
  const flagLike = (s) => String(s ?? '').startsWith('-');

  function useRef(agentId, ref) {
    const r = normRef(ref);
    if (!r) return { err: refuse('invalid_ref', `invalid ref: ${ref}`) };
    const s = st(agentId);
    if (!s.valid || !s.refs.has(r)) return { err: refuse('stale_ref', `stale_ref: ${r} is not in the current snapshot; take a new snapshot first`) };
    return { r, line: s.refs.get(r) };
  }

  async function act(agentId, action, target, extra, fn) {
    const res = await fn();
    try { onAction?.({ agentId, tool: 'browser', action, target, ...extra, at: now(), ok: res.ok }); } catch { /* observer errors never block a tool */ }
    return res;
  }
  const cli = (agentId, args, o) => tool.run(args, { session: sessionName(agentId), ...o });
  const secret = (line) => /password|passwd|secret|type=password/i.test(line ?? '');

  return {
    doctor: () => tool.doctor(),
    open: (agentId, url) => act(agentId, 'open', url, {}, async () => {
      const c = checkUrl(url);
      if (c.err) return c.err;
      const r = await cli(agentId, ['open', c.url]);
      if (r.ok) { const s = st(agentId); s.valid = false; s.refs.clear(); s.url = c.url; }
      return r;
    }),
    snapshot: (agentId, { interactive = true } = {}) => act(agentId, 'snapshot', null, {}, async () => {
      const r = await cli(agentId, interactive ? ['snapshot', '-i'] : ['snapshot']);
      if (r.ok) {
        const s = st(agentId);
        s.refs.clear();
        for (const line of r.text.split('\n')) { const m = /\[ref=(e\d+)\]/.exec(line); if (m) s.refs.set(`@${m[1]}`, line); }
        s.valid = true;
      }
      return r;
    }),
    click: (agentId, ref) => act(agentId, 'click', ref, {}, async () => {
      const u = useRef(agentId, ref); return u.err ?? cli(agentId, ['click', u.r]);
    }),
    fill: (agentId, ref, text) => act(agentId, 'fill', ref, { length: String(text ?? '').length }, async () => {
      const u = useRef(agentId, ref);
      if (u.err) return u.err;
      if (!policy.allowSecrets && secret(u.line)) return refuse('policy', 'refusing to fill a password field');
      return cli(agentId, ['fill', u.r, String(text)]);
    }),
    type: (agentId, text, { ref } = {}) => act(agentId, 'type', ref ?? null, { length: String(text ?? '').length }, async () => {
      if (ref === undefined) return cli(agentId, ['keyboard', 'type', String(text)]);
      const u = useRef(agentId, ref);
      if (u.err) return u.err;
      if (!policy.allowSecrets && secret(u.line)) return refuse('policy', 'refusing to type into a password field');
      return cli(agentId, ['type', u.r, String(text)]);
    }),
    press: (agentId, key) => act(agentId, 'press', key, {}, async () => (flagLike(key) || !key ? refuse('invalid_arg', 'bad key') : cli(agentId, ['press', String(key)]))),
    get: (agentId, what, { ref } = {}) => act(agentId, `get ${what}`, ref ?? null, {}, async () => {
      if (what === 'url' || what === 'title') return cli(agentId, ['get', what]);
      if (what !== 'text') return refuse('invalid_arg', 'get: url, title or text');
      const u = useRef(agentId, ref);
      return u.err ?? cli(agentId, ['get', 'text', u.r]);
    }),
    wait: (agentId, c = {}) => act(agentId, 'wait', null, {}, async () => {
      if (c.fn !== undefined) return policy.allowEval ? cli(agentId, ['wait', '--fn', String(c.fn)]) : refuse('policy', 'wait --fn runs page JavaScript; set allowEval');
      for (const k of ['text', 'url', 'load', 'selector']) if (c[k] !== undefined && flagLike(c[k])) return refuse('invalid_arg', `bad ${k}`);
      if (c.text !== undefined) return cli(agentId, ['wait', '--text', String(c.text)]);
      if (c.url !== undefined) return cli(agentId, ['wait', '--url', String(c.url)]);
      if (c.load !== undefined) return cli(agentId, ['wait', '--load', String(c.load)]);
      if (c.ms !== undefined) return Number.isInteger(c.ms) && c.ms >= 0 ? cli(agentId, ['wait', String(c.ms)]) : refuse('invalid_arg', 'ms must be a non-negative integer');
      if (c.selector !== undefined) return cli(agentId, ['wait', String(c.selector)]);
      return refuse('invalid_arg', 'wait needs text, url, load, ms or selector');
    }),
    screenshot: (agentId, path) => act(agentId, 'screenshot', null, {}, async () => (flagLike(path) ? refuse('invalid_arg', 'bad path') : cli(agentId, path ? ['screenshot', path] : ['screenshot']))),
    read: (agentId) => act(agentId, 'read', null, {}, () => cli(agentId, ['read'])),
    tabs: (agentId) => act(agentId, 'tabs', null, {}, () => cli(agentId, ['tab'])),
    eval: (agentId, js) => act(agentId, 'eval', null, { length: String(js ?? '').length }, async () => (policy.allowEval ? cli(agentId, ['eval', String(js)]) : refuse('policy', 'eval is off; set allowEval'))),
    close: (agentId) => act(agentId, 'close', null, {}, async () => { const r = await cli(agentId, ['close']); states.delete(agentId); return r; }),
  };
}
