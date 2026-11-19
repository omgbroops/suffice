// Pi extension: puts the tool registry in the product path. The model sees pinned tools + tool_search + a fixed
// name/one-line catalog in the system prompt; matched tools are activated (appended) for the rest of the thread.
import { Type } from 'typebox';
import { createToolRegistry, shouldDefer, SEARCH_TOOL, PINNED } from './tool-registry.mjs';

export const PINNED_PRODUCT = [...PINNED, 'write', 'codemode', 'retrieve_output'];

export function createDeferralExtension({ setting = 'auto', contextWindow = 128000, pinned = PINNED_PRODUCT } = {}) {
  const registry = createToolRegistry({ pinned });
  const state = { saved: 0, calls: 0, decided: false };
  const snapshot = () => ({ ...registry.stats(), saved: state.saved, calls: state.calls, deferOn: !!state.userOn, prefixHash: registry.prefixHash() });
  const extension = (pi) => {
    pi.registerTool({
      name: SEARCH_TOOL, label: SEARCH_TOOL, defaultActive: false, exposure: 'model-only',
      description: 'Find tools that are not loaded yet. Describe what you need; the best 5 matches are loaded for the rest of this thread. The catalog of names is in the system prompt.',
      parameters: Type.Object({ query: Type.String({ minLength: 1 }) }),
      async execute(_id, { query }) {
        const hits = registry.search(query);
        const active = pi.getActiveTools();
        pi.setActiveTools([...active, ...hits.map((h) => h.name).filter((n) => !active.includes(n))]);
        const text = hits.length ? JSON.stringify(hits) : 'No matching tools. Try other keywords.';
        return { content: [{ type: 'text', text }], details: { found: hits.map((h) => h.name) } };
      },
    });
    const sync = () => {
      for (const t of pi.getAllTools()) if (t.name !== SEARCH_TOOL && !registry.has(t.name)) registry.register(t);
      if (!state.decided) {
        state.decided = true;
        const forced = pi.getAllTools().filter((t) => t.exposure === 'deferred' && t.name !== SEARCH_TOOL).map((t) => t.name);
        // Off still serves tools their owner already deferred (MCP): everything else is pinned, only those wait behind tool_search.
        const on = shouldDefer({ schemaTokens: registry.stats().schemaTokens, contextWindow, override: setting });
        if (!on) for (const n of registry.names()) if (!forced.includes(n)) registry.pin(n);
        registry.setEnabled(on || forced.length > 0);
        state.userOn = on;
        if (registry.enabled) {
          const keep = pi.getActiveTools().filter((n) => !registry.has(n) || registry.isLoaded(n));
          pi.setActiveTools([...new Set([...keep, SEARCH_TOOL])]);
        }
      }
    };
    pi.on('before_agent_start', (e) => {
      sync();
      return registry.enabled ? { systemPrompt: `${e.systemPrompt}\n\nTools not loaded yet (call ${SEARCH_TOOL} to load their schemas):\n${registry.catalogText()}` } : undefined;
    });
    pi.on('tool_call', (e) => {
      const reason = registry.enabled ? registry.guard(e.toolName) : null;
      return reason ? { block: true, reason } : undefined;
    });
    pi.on('before_provider_request', () => { state.calls++; state.saved += registry.stats().savedPerCall; });
  };
  return Object.assign(extension, { registry, snapshot });
}
