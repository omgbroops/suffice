// Built-in plugins: "browser" (agent-browser CLI) and "desktop" (agent-desktop CLI).
// See browser.mjs and desktop.mjs for the exact commands verified and the ones left unverified.
// Tools register as browser:<id> and desktop:<id> (the plugin host prefixes the plugin name).
// Config comes from ctx.config: {exec, policy, approve, onAction}; exec defaults to the real runner.
import { createExec } from '../runner/index.mjs';
import { createBrowser } from './browser.mjs';
import { createDesktop } from './desktop.mjs';

const str = (description) => ({ type: 'string', description });
const agent = { type: 'string', description: 'Calling agent id; each agent gets its own session. Default "default".' };
const schema = (properties, required = []) => ({ type: 'object', properties: { agentId: agent, ...properties }, required, additionalProperties: false });
const ref = (what) => str(`Element ref from the latest snapshot (${what}).`);
const B = '@e3, e3';
const D = '@s1abc:e3';

const browserTools = (b) => ({
  open: ['Open a URL in the agent browser; only allowed domains work.', schema({ url: str('Full URL, or host name.') }, ['url']), (a) => b.open(a.agentId, a.url)],
  snapshot: ['Snapshot the page as text with element refs; take one after every navigation.', schema({ interactive: { type: 'boolean', description: 'Only interactive elements (default true).' } }), (a) => b.snapshot(a.agentId, { interactive: a.interactive })],
  click: ['Click an element by ref from the latest snapshot.', schema({ ref: ref(B) }, ['ref']), (a) => b.click(a.agentId, a.ref)],
  fill: ['Replace the text of an input by ref; password fields are refused.', schema({ ref: ref(B), text: str('Text to enter.') }, ['ref', 'text']), (a) => b.fill(a.agentId, a.ref, a.text)],
  type: ['Type text into an element by ref, or into the focused element when no ref is given.', schema({ text: str('Text to type.'), ref: ref(B) }, ['text']), (a) => b.type(a.agentId, a.text, { ref: a.ref })],
  press: ['Press a key or combo such as Enter or Control+a.', schema({ key: str('Key name.') }, ['key']), (a) => b.press(a.agentId, a.key)],
  get: ['Read the page url, title, or the text of an element.', schema({ what: { type: 'string', enum: ['url', 'title', 'text'] }, ref: ref(B) }, ['what']), (a) => b.get(a.agentId, a.what, { ref: a.ref })],
  wait: ['Wait for text, a url pattern, a load state, a selector or a number of milliseconds.', schema({ text: str('Visible text.'), url: str('URL pattern.'), load: str('Load state, e.g. networkidle.'), selector: str('CSS selector or ref.'), ms: { type: 'integer', minimum: 0, description: 'Milliseconds.' }, fn: str('JavaScript condition; needs allowEval.') }), (a) => b.wait(a.agentId, a)],
  screenshot: ['Save a screenshot of the page to a file path.', schema({ path: str('Output file path.') }), (a) => b.screenshot(a.agentId, a.path)],
  read: ['Read the current page as clean text.', schema({}), (a) => b.read(a.agentId)],
  tabs: ['List open tabs.', schema({}), (a) => b.tabs(a.agentId)],
  eval: ['Run JavaScript in the page; disabled unless the policy allows it.', schema({ js: str('JavaScript expression.') }, ['js']), (a) => b.eval(a.agentId, a.js)],
  close: ['Close this agent browser session.', schema({}), (a) => b.close(a.agentId)],
});

const desktopTools = (d) => ({
  apps: ['List running desktop apps.', schema({}), (a) => d.apps(a.agentId)],
  snapshot: ['Snapshot an allowed app window as an accessibility tree with element refs.', schema({ app: str('App name.'), root: str(`Limit to the subtree under this ref (${D}).`), depth: { type: 'integer', minimum: 1, maximum: 50 } }, ['app']), (a) => d.snapshot(a.agentId, a.app, { root: a.root, depth: a.depth })],
  click: ['Click an element by ref; the first action in an app needs user approval.', schema({ ref: ref(D) }, ['ref']), (a) => d.click(a.agentId, a.ref)],
  type: ['Type text into an element by ref; secure fields are refused.', schema({ ref: ref(D), text: str('Text to type.') }, ['ref', 'text']), (a) => d.type(a.agentId, a.ref, a.text)],
  key: ['Press a key combo in the app last snapshotted or focused.', schema({ combo: str('Key combo such as cmd+s.') }, ['combo']), (a) => d.key(a.agentId, a.combo)],
  scroll: ['Scroll an element by ref.', schema({ ref: ref(D), direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] } }, ['ref', 'direction']), (a) => d.scroll(a.agentId, a.ref, a.direction)],
  focus: ['Bring an allowed app window to the front.', schema({ app: str('App name.') }, ['app']), (a) => d.focus(a.agentId, a.app)],
  screenshot: ['Save a screenshot of an allowed app to a file path.', schema({ app: str('App name.'), path: str('Output file path.') }, ['app', 'path']), (a) => d.screenshot(a.agentId, a.app, a.path)],
});

const tools = { browser: browserTools, desktop: desktopTools };

export const manifests = {
  browser: { name: 'browser', version: '0.1.0', main: 'index.mjs', permissions: ['exec', 'net'], contributes: { tools: Object.keys(browserTools({})) } },
  desktop: { name: 'desktop', version: '0.1.0', main: 'index.mjs', permissions: ['exec', 'ui'], contributes: { tools: Object.keys(desktopTools({})) } },
};

async function activatePlugin(name, ctx) {
  if (!tools[name]) throw new Error(`builtins: unknown plugin ${name}`);
  const cfg = ctx.config ?? {};
  const exec = ctx.exec ?? cfg.exec ?? createExec();
  const onAction = cfg.onAction ?? ((evt) => ctx.bus?.emit?.('builtins.action', evt));
  const base = { exec, clock: ctx.clock, policy: cfg.policy ?? {}, onAction, decide: cfg.decide };
  const impl = name === 'browser' ? createBrowser({ ...base, approve: cfg.approve }) : createDesktop({ ...base, approve: cfg.approve });
  for (const [id, [description, inputSchema, fn]] of Object.entries(tools[name](impl))) {
    const tool = (args = {}) => fn({ ...args, agentId: args.agentId ?? 'default' });
    tool.def = { name: `${name}:${id}`, description, inputSchema };
    ctx.register('tools', id, tool);
  }
  return impl;
}

export const builtinPlugins = () => Object.values(manifests).map((manifest) => ({ manifest, activate: (ctx) => activatePlugin(manifest.name, ctx) }));

// Publishes builtins:status and agents:screens. Wire record() to the onAction callback, refresh() at startup.
export function defineBuiltinSlots(slots, { exec = createExec(), clock, browser, desktop } = {}) {
  const b = browser ?? createBrowser({ exec, clock });
  const d = desktop ?? createDesktop({ exec, clock });
  const none = { installed: false, version: null };
  const status = slots.define({ id: 'builtins:status', title: 'Built-in tools', schema: { type: 'object' } }, { browser: none, desktop: none });
  const screens = slots.define({ id: 'agents:screens', title: 'Agent screens', schema: { type: 'object' } }, {});
  const state = {};
  const urls = {};
  return {
    async refresh() { status.set({ browser: await b.doctor(), desktop: await d.doctor() }); },
    record(evt) {
      if (evt.tool === 'browser' && /^(https?:|about:)/.test(evt.target ?? '')) urls[evt.agentId] = evt.target;
      const target = evt.tool === 'browser' ? (urls[evt.agentId] ?? null) : (evt.app ?? null);
      state[evt.agentId] = { tool: evt.tool, target, action: evt.action, at: evt.at };
      screens.set({ ...state });
    },
  };
}
