// What each coding-agent CLI exposes, checked against its docs or source on 2026-11-15. 'unknown' = not found in a source, never guessed.
// structuredProtocol: exact flag/subcommand that gives a machine-readable session. Adapter entries start with "adapter:".
// permissionDialogs: 'known' only where the dialog strings were read from source (opencode); everything else 'unknown'.
const U = 'unknown';
const e = (name, bin, openSource, repo, transcript, structuredProtocol, notes, sources, permissionDialogs = U) =>
  ({ name, bin, openSource, repo, transcript, structuredProtocol, permissionDialogs, notes, sources });
const ACP = 'https://agentclientprotocol.com/overview/agents';

export const landscape = [
  e('opencode', 'opencode', true, 'https://github.com/sst/opencode', { where: '<home>/.local/share/opencode/opencode.db', format: 'sqlite: session, message, part (JSON data columns)' },
    ['opencode serve', 'opencode acp'], 'TUI is an SDK client of serve (HTTP + SSE: message.part.updated, message.part.delta, session.updated, session.error); serve carries live permission events, so it is a cleaner feed than polling the DB.',
    ['https://github.com/sst/opencode (v1.19.5 source: cli/cmd/serve.ts, cli/cmd/acp.ts, tui/src/routes/session/permission.tsx)', ACP], 'known'),
  e('gemini', 'gemini', true, 'https://github.com/google-gemini/gemini-cli', null, ['gemini --acp'], 'Apache-2.0. Session store location not stated in the ACP doc.',
    ['https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/acp-mode.md', ACP]),
  e('cursor-agent', 'agent', false, U, null, ['agent acp'], 'JSON-RPC 2.0 over stdio. Closed source (no public repo found).', ['https://cursor.com/docs/cli/acp', ACP]),
  e('copilot', 'copilot', false, 'https://github.com/github/copilot-cli', null, ['copilot --acp', 'copilot --acp --stdio', 'copilot --acp --port <n>'],
    'ACP server is public preview; --stdio is the default. Repo license NOASSERTION, so openSource is false until a license is read.',
    ['https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server', ACP]),
  e('amp', 'amp', false, U, null, [], 'Manual states no ACP, stream-json, transcript path or source repo; all unknown. Not on the ACP agents list. Goose lists Amp as an ACP provider it wraps.',
    ['https://ampcode.com/manual', ACP]),
  e('pi', 'pi', true, 'https://github.com/badlogic/pi-mono', { where: '~/.pi/agent/sessions/--<path>--/<timestamp>_<id>.jsonl', format: 'jsonl, v3 tree with id/parentId' },
    ['pi --mode rpc', 'adapter: svkozak/pi-acp (spawns pi --mode rpc)'], 'MIT. Also json mode and an SDK. ACP only through the third-party adapter.',
    ['https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent (docs/session-format.md, docs/rpc.md)', ACP]),
  e('aider', 'aider', true, 'https://github.com/Aider-AI/aider', { where: 'path set by --chat-history-file (default file name not read)', format: U }, [],
    'Apache-2.0. No ACP; not on the ACP agents list. Has --chat-history-file and --input-history-file options; format unverified.',
    ['https://github.com/Aider-AI/aider/blob/main/aider/args.py', ACP]),
  e('goose', 'goose', true, 'https://github.com/block/goose', null, ['goose acp'], 'Apache-2.0. `goose acp` = "Run goose as an ACP agent server on stdio" (cli.rs). Session storage unknown.',
    ['https://github.com/block/goose/blob/main/crates/goose-cli/src/cli.rs', ACP]),
  e('qwen', 'qwen', true, 'https://github.com/QwenLM/qwen-code', null, ['qwen --acp', 'qwen serve', 'qwen -p --output-format stream-json'],
    'Apache-2.0. config.ts defines acp and experimental-acp options and --input-format/--output-format; README says serve exposes HTTP + SSE (ACP).',
    ['https://github.com/QwenLM/qwen-code/blob/main/packages/cli/src/config/config.ts', ACP]),
  e('kilo', 'kilo', true, 'https://github.com/Kilo-Org/kilocode', null, ['kilo acp', 'kilo serve'],
    'MIT fork of opencode; packages/opencode/src/cli/cmd has acp.ts and serve.ts. Invocation inferred from the file names; storage unknown (likely opencode-shaped, unverified).',
    ['https://github.com/Kilo-Org/kilocode/tree/main/packages/opencode/src/cli/cmd']),
  e('droid', 'droid', false, U, null, ['droid exec --output-format stream-jsonrpc', 'droid exec --output-format acp', 'droid exec --input-format stream-jsonrpc'],
    'Closed source. These flags are for exec (non-interactive); an interactive droid TUI cannot be mirrored through them.', ['https://docs.factory.com/cli/droid-exec/overview', ACP]),
  e('kimi', 'kimi', true, 'https://github.com/MoonshotAI/kimi-code', null, ['kimi acp'], 'Kimi Code CLI README lists ACP with args ["acp"]; the older kimi-cli (Apache-2.0, archived) used the same. Session doc exists, location not read.',
    ['https://github.com/MoonshotAI/kimi-code', 'https://moonshotai.github.io/kimi-code/en/guides/sessions', ACP]),
  e('cline', 'cline', true, 'https://github.com/cline/cline', null, ['cline --json', 'ACP: apps/cli/src/acp in repo (flag not read)'],
    'Apache-2.0. ACP code exists in apps/cli/src/acp and docs/usage/acp.mdx; exact launch flag unverified.', ['https://github.com/cline/cline/tree/main/apps/cli/src/acp', ACP]),
  e('claude-code', 'claude', false, 'https://github.com/anthropics/claude-code', { where: '~/.claude/projects/<cwd>/<session>.jsonl', format: 'jsonl' },
    ['adapter: zed-industries/claude-agent-acp'], 'Closed source, no license in repo. Own mapper exists in tui/claude.mjs.', ['https://github.com/zed-industries/claude-agent-acp', ACP]),
  e('codex', 'codex', true, 'https://github.com/openai/codex', { where: '~/.codex/sessions', format: 'jsonl' },
    ['adapter: agentclientprotocol/codex-acp'], 'Apache-2.0. Own mapper exists in tui/codex.mjs.', ['https://github.com/agentclientprotocol/codex-acp', ACP]),
  e('crush', 'crush', false, 'https://github.com/charmbracelet/crush', null, [], 'License NOASSERTION. Not on the ACP agents list; no structured flag found in the repo listing.', ['https://github.com/charmbracelet/crush', ACP]),
  e('openhands', 'openhands', true, 'https://github.com/OpenHands/OpenHands', null, ['ACP: listed, launch flag not read'], 'MIT. Listed as an ACP agent without a stated mechanism.', [ACP]),
];

const isAcp = (c) => c.structuredProtocol.some((p) => /\bacp\b|--acp|-acp/i.test(p));

// Cheapest reliable route to items + prompts + controls. 'acp' means the desktop spawns the agent as an ACP server and is its client;
// it does not mirror an already-running TUI (opencode serve and own mappers do).
const OWN = { opencode: 'own mapper over the sqlite store for history; opencode serve SSE for live items and permission events', pi: 'own mapper over the session JSONL; pi --mode rpc for live', 'claude-code': 'own mapper (tui/claude.mjs)', codex: 'own mapper (tui/codex.mjs)' };
export const mappingPlan = Object.fromEntries(landscape.map((c) => {
  if (OWN[c.name]) return [c.name, { route: c.name === 'opencode' ? 'server-api' : 'own-mapper', how: OWN[c.name] }];
  if (isAcp(c)) return [c.name, { route: 'acp', how: c.structuredProtocol.find((p) => /acp/i.test(p)) }];
  return [c.name, { route: 'generic-fallback', how: 'terminal view plus generic.mjs parsePrompt; chat view shows only what the user sent' }];
}));

const direct = (c) => c.structuredProtocol.some((p) => !p.startsWith('adapter:') && /acp/i.test(p));
const viaAdapter = (c) => !direct(c) && c.structuredProtocol.some((p) => p.startsWith('adapter:') && /acp/i.test(p));
export const acpCount = { total: landscape.length, direct: landscape.filter(direct).length, adapterOnly: landscape.filter(viaAdapter).length,
  none: landscape.filter((c) => !direct(c) && !viaAdapter(c)).map((c) => c.name) };
