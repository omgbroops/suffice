// Slash-command, model, effort and mode catalogs for the Claude Code and Codex TUIs, plus the
// text/bytes that drive them. Facts are dated KNOWN_AT; the TUIs ship new ones, so treat lists as hints.
import nodeFs from 'node:fs';
import path from 'node:path';
import { createClaudeMapper } from './claude.mjs';
import { controls as codexControls } from './codex.mjs';

export const KNOWN_AT = '2026-11-16';
const dec = (r) => new TextDecoder().decode(r.bytes);

// ---- Claude built-ins: https://code.claude.com/docs/en/commands.md (table), fetched 2026-11-16 ----
// Rows marked "Removed" are skipped; duplicate names keep the first row. [name, description, argumentHint?]
const CLAUDE_BUILTIN = [
  ["add-dir", "Add a working directory for file access", "<path>"],
  ["advisor", "Enable or disable the advisor tool, which consults a second model for guidance at key moments...", "[model|off]"],
  ["agents", "Print a reminder to ask Claude to create or manage subagents, or to edit .claude/agents/ or..."],
  ["artifact-capabilities", "Skill"],
  ["artifact-diagramming", "Skill"],
  ["artifacts", "List the artifacts you own or that are shared with you, then attach one to the session, open it..."],
  ["auto-mode-setup", "Draft autoMode.environment entries from your project and recent sessions, then review the draft..."],
  ["autocompact", "Set the auto-compact window: how full the context window gets before Claude Code compacts...", "[auto|<tokens>]"],
  ["autofix-pr", "Spawn a cloud session that watches the current branch's PR and pushes fixes when CI fails or...", "[prompt]"],
  ["background", "Detach the current session to run as a background agent and free this terminal", "[prompt]"],
  ["batch", "Skill", "<instruction>"],
  ["branch", "Create a branch of the current conversation at this point, so you can try a different direction...", "[name]"],
  ["btw", "Ask a side question about the current session without adding to the conversation", "[question]"],
  ["bug", "Report a bug or share your conversation", "[report]"],
  ["cd", "Move this session to a new working directory, keeping the conversation", "<path>"],
  ["chrome", "Configure Claude in Chrome settings"],
  ["claude-api", "Skill", "[migrate|upgrade|api-version|managed-agents-onboard|managed-agents-secure|prompt-audit|cost-optimize|latency-optimize|build-eval|hillclimb|preserved-thinking-migration]"],
  ["claude-in-chrome", "Skill", "[task]"],
  ["clear", "Start a new conversation with empty context", "[name]"],
  ["code-review", "Skill", "[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [--max-findings n|all|default] [pr#|branch|path]"],
  ["color", "Set the prompt bar color for the current session", "[color|default]"],
  ["compact", "Free up context by summarizing the conversation so far", "[instructions]"],
  ["config", "Open the Settings interface to adjust preferences", "[key=value ...]"],
  ["context", "Visualize current context usage as a colored grid", "[all]"],
  ["copy", "Copy the last assistant response to clipboard", "[N]"],
  ["cost", "Alias for /usage"],
  ["dataviz", "Skill", "[request]"],
  ["debug", "Skill", "[description]"],
  ["deep-research", "Workflow", "<question>"],
  ["design", "Skill", "[brief]"],
  ["design-login", "Authorize design-system access for /design-sync with your claude.ai account"],
  ["design-sync", "Skill", "[hint]"],
  ["desktop", "Continue the current session in the Claude Code Desktop app"],
  ["diff", "Review the changes in your working tree, including the edits Claude has made so far"],
  ["doctor", "Skill", "[prompt-audit [path]]"],
  ["effort", "Set the effort level: low to xhigh, max, or auto; status prints it", "[level|auto|status|ultracode [on|off]]"],
  ["exit", "Exit the CLI"],
  ["export", "Export the current conversation as plain text", "[filename]"],
  ["fast", "Toggle fast mode on or off", "[on|off]"],
  ["feedback", "Send product feedback about Claude Code", "[report]"],
  ["fewer-permission-prompts", "Skill"],
  ["focus", "Toggle the focus view, which shows only your last prompt, a one-line tool-call summary with edit..."],
  ["fork", "Copy the current conversation into a new background session and keep working here", "[prompt]"],
  ["goal", "Set a goal: Claude keeps working across turns until the condition is met or the goal clears for...", "[condition|clear]"],
  ["heapdump", "Write a JavaScript heap snapshot and a memory breakdown to ~/Desktop, or your home directory on..."],
  ["help", "Show help and available commands"],
  ["hooks", "View hook configurations"],
  ["ide", "Manage IDE integrations and show status"],
  ["import", "Bring configuration from OpenAI Codex, Google Gemini CLI, or Cursor on your machine into Claude...", "[codex|gemini|cursor] [--dry-run] [--yes]"],
  ["init", "Initialize project with a CLAUDE.md guide"],
  ["insights", "Generate an HTML report analyzing your recent sessions on this machine: which projects you work..."],
  ["install-github-app", "Install the Claude GitHub App for a repository, with an optional step to set up GitHub Actions..."],
  ["install-slack-app", "Install the Claude Slack app"],
  ["keybindings", "Open your keyboard shortcuts file"],
  ["list-agents", "List the subagents, agent team teammates, and other Claude Code sessions Claude can message,..."],
  ["login", "Sign in to your Anthropic account"],
  ["logout", "Sign out from your Anthropic account"],
  ["loop", "Skill", "[interval] [prompt]"],
  ["mcp", "Manage MCP server connections and OAuth authentication", "[reconnect (<server>|all)|enable|disable [<server>|all]]"],
  ["memory", "Edit CLAUDE.md files, enable or disable auto memory, and view auto memory entries"],
  ["mobile", "Show QR code to download the Claude mobile app"],
  ["model", "Switch the AI model and save it as your default for new sessions", "[model]"],
  ["output-style", "List output styles or switch to one, for example /output-style concise", "[style]"],
  ["passes", "Share a free week of Claude Code with friends"],
  ["permissions", "Manage allow, ask, and deny rules for tool permissions"],
  ["plan", "Enter plan mode directly from the prompt", "[description]"],
  ["plugin", "Manage Claude Code plugins", "[subcommand]"],
  ["plugin-authoring", "Load the reference Claude works from to write a mod"],
  ["powerup", "Discover Claude Code features through quick interactive lessons with animated demos"],
  ["privacy-settings", "View and update your privacy settings"],
  ["radio", "Open Claude FM lo-fi radio in your browser"],
  ["rate-limit-options", "Show ways to keep working when a claude.ai usage limit blocks a request: wait and continue..."],
  ["recap", "Generate a one-line summary of the current session on demand"],
  ["release-notes", "View the changelog in an interactive version picker"],
  ["reload-plugins", "Reload all active plugins to apply pending changes without restarting", "[--force]"],
  ["reload-skills", "Re-scan skill and command directories so skills added or changed on disk during the session..."],
  ["remote-control", "Make this session available for Remote Control from claude.ai"],
  ["remote-env", "Choose the default cloud environment for cloud sessions you start from the CLI"],
  ["rename", "Rename the current session and show the name on the prompt bar", "[name]"],
  ["restart", "Restart Claude Code and resume this session, which applies an installed update"],
  ["resume", "Resume a conversation by ID or name, or open the session picker", "[session]"],
  ["review", "Alias of /code-review: reviews the current diff, or a PR number, branch, or path you pass, such...", "[low|medium|high|xhigh|max|ultra] [--fix] [--comment] [--max-findings n|all|default] [pr#|branch|path]"],
  ["rewind", "Rewind the conversation and/or code to a previous point, or summarize from a selected message"],
  ["run", "Skill"],
  ["run-skill-generator", "Skill"],
  ["sandbox", "Toggle sandbox mode"],
  ["schedule", "Create, update, list, or run cloud scheduled tasks, formerly routines", "[description]"],
  ["scroll-speed", "Adjust mouse wheel scroll speed interactively"],
  ["security-review", "Analyze the changes on your current branch for security vulnerabilities"],
  ["setup-bedrock", "Configure Amazon Bedrock authentication, region, and model pins through an interactive wizard"],
  ["setup-vertex", "Configure Google Cloud's Agent Platform authentication, project, region, and model pins through..."],
  ["simplify", "Skill", "[target]"],
  ["skill-doctor", "Show what each of your skills costs in context and how often it gets used, so you can find..."],
  ["skills", "List available skills"],
  ["slides", "Skill", "[brief]"],
  ["stats", "Alias for /usage"],
  ["status", "Open the Settings interface on the Status tab, showing version, model, account, and connectivity"],
  ["statusline", "Configure Claude Code's status line"],
  ["stickers", "Check Claude Code sticker availability"],
  ["stop", "Stop the background session you're attached to, or the one you send it to as a peek reply; the..."],
  ["subtask", "Spawn a forked subagent: a background subagent that inherits the full conversation and works on...", "<task>"],
  ["tasks", "View and manage background work in the current session, including subagents that have finished"],
  ["team-onboarding", "Generate a team onboarding guide from your Claude Code usage history"],
  ["teleport", "Pull a cloud session into this terminal"],
  ["terminal-setup", "Install a Shift+Enter keybinding for newlines in VS Code, Cursor, Devin Desktop, Alacritty, or Zed"],
  ["theme", "Change the color theme"],
  ["tui", "Set the terminal UI renderer and relaunch into it with your conversation intact", "[default|fullscreen]"],
  ["ultrareview", "Run a deep, multi-agent code review in a cloud sandbox with ultrareview", "[PR or branch]"],
  ["update-config", "Skill", "[request]"],
  ["upgrade", "Open the upgrade page in your browser to switch to a higher plan tier"],
  ["usage", "Show session cost, plan usage limits, and activity stats"],
  ["usage-credits", "Configure usage credits, or request them from your admin, when you hit a limit"],
  ["verify", "Skill"],
  ["voice", "Toggle voice dictation, or enable it in a specific mode", "[hold|tap|off]"],
  ["web-setup", "Connect your GitHub account for cloud sessions using your local gh CLI credentials"],
  ["workflow-authoring", "Skill"],
  ["workflows", "Open the workflow progress view to watch, pause, resume, or save running and completed workflows"],
];

// ---- Codex: codex-rs/tui/src/slash_command.rs at tag rust-v0.159.0 (description() + supports_inline_args) ----
// Debug-only entries (debug-m-drop, debug-m-update, test-approval) are left out. Argument hints here are assumed
// wording (the source only says which commands take inline args). [name, description, argumentHint?]
const CODEX_BUILTIN = [
  ['model', 'choose what model and reasoning effort to use'],
  ['ide', 'include current selection, open files, and other context from your IDE', '[on|off]'], // assumed hint
  ['permissions', 'choose what Codex is allowed to do'],
  ['keymap', 'remap TUI shortcuts'],
  ['vim', 'toggle Vim mode for the composer'],
  ['setup-default-sandbox', 'set up elevated agent sandbox'],
  ['experimental', 'toggle experimental features'],
  ['approve', 'approve one retry of a recent auto-review denial'],
  ['memories', 'configure memory use and generation'],
  ['skills', 'use skills to improve how Codex performs specific tasks'],
  ['import', 'import setup, this project, and recent chats from Claude Code'],
  ['hooks', 'view and manage lifecycle hooks'],
  ['review', 'review my current changes and find issues', '[instructions]'],
  ['rename', 'rename the current thread', '[name]'],
  ['new', 'start a new chat during a conversation'],
  ['archive', 'archive this session'],
  ['delete', 'permanently delete this session'],
  ['resume', 'resume a saved chat', '[session]'],
  ['fork', 'fork the current chat'],
  ['worktree', 'start or continue a conversation in a new worktree'],
  ['app', 'continue this session in the Desktop app'],
  ['init', 'create an AGENTS.md file with instructions for Codex'],
  ['compact', 'summarize conversation to prevent hitting the context limit'],
  ['recap', 'summarize the current conversation now'],
  ['plan', 'switch to Plan mode', '[prompt]'],
  ['voice', 'start or stop voice; use /voice settings to choose a voice'],
  ['goal', 'set or view the goal for a long-running task', '[goal]'],
  ['agents', 'open the agent command center'],
  ['side', 'start a side conversation in an ephemeral fork', '[prompt]'],
  ['btw', 'start a side conversation in an ephemeral fork', '[prompt]'],
  ['copy', 'copy the last response or part of it'],
  ['export', 'export the conversation as markdown', '[path]'],
  ['raw', 'toggle raw scrollback mode for copy-friendly terminal selection'],
  ['tui', 'choose the TUI mode for the next launch'],
  ['diff', 'show git diff (including untracked files)'],
  ['mention', 'mention a file'],
  ['status', 'show current session configuration and token usage'],
  ['daemon', 'Manage the local background server'],
  ['warnings', 'view retained warnings and diagnostic details'],
  ['cd', 'change the current working directory', '[path]'],
  ['pwd', 'show the current working directory'],
  ['cwd', 'show the current working directory'], // alias of pwd
  ['usage', 'view account usage or use a usage limit reset'],
  ['debug-config', 'show config layers and requirement sources for debugging'],
  ['title', 'configure which items appear in the terminal title'],
  ['statusline', 'configure which items appear in the status line'],
  ['theme', 'choose a syntax highlighting theme'],
  ['pets', 'choose or hide the terminal pet'],
  ['pet', 'choose or hide the terminal pet'], // alias of pets
  ['mcp', 'list configured MCP tools; use /mcp verbose for details', '[verbose]'],
  ['apps', 'manage apps'],
  ['plugins', 'browse plugins'],
  ['logout', 'log out of Codex'],
  ['quit', 'exit Codex'],
  ['exit', 'exit Codex'],
  ['feedback', 'send logs to maintainers'],
  ['rollout', 'print the rollout file path'],
  ['ps', 'list background terminals'],
  ['stop', 'stop all background terminals'],
  ['clean', 'stop all background terminals'], // alias of stop
  ['clear', 'clear the terminal and start a new chat'],
  ['subagents', "switch between this session's subagents"],
];

const row = ([name, description, argumentHint], source) => ({ name, description, source, ...(argumentHint ? { argumentHint } : {}) });

// Minimal frontmatter reader: only name, description, argument-hint, single-line values.
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description|argument-hint):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

const firstLine = (s = '') => s.split(/\r?\n/)[0].slice(0, 110);

function walkMd(fs, dir, rel = []) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of ents) {
    if (e.isDirectory()) out.push(...walkMd(fs, path.join(dir, e.name), [...rel, e.name]));
    else if (e.name.endsWith('.md')) out.push({ file: path.join(dir, e.name), name: [...rel, e.name.slice(0, -3)].join(':') });
  }
  return out;
}

// Discovery rules: skills.md "How a skill gets its command name" (fetched 2026-11-16).
// shortcut: plugin commands (/plugin:skill), nested skills and --add-dir skills are not discovered, add when a session reports them.
function discoverClaude({ home, cwd, fs }) {
  const found = [];
  for (const [base, kind] of [[home && path.join(home, '.claude'), 'user'], [cwd && path.join(cwd, '.claude'), 'project']]) {
    if (!base) continue;
    for (const c of walkMd(fs, path.join(base, 'commands'))) {
      try {
        const fm = frontmatter(fs.readFileSync(c.file, 'utf8'));
        found.push({ name: c.name, description: firstLine(fm.description), source: kind, ...(fm['argument-hint'] ? { argumentHint: fm['argument-hint'] } : {}) });
      } catch { /* unreadable file: skip */ }
    }
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(base, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { /* none */ }
    for (const d of dirs) {
      try {
        const fm = frontmatter(fs.readFileSync(path.join(base, 'skills', d.name, 'SKILL.md'), 'utf8'));
        // a skill directory wins over a commands file of the same name (skills.md)
        found.push({ name: fm.name || d.name, description: firstLine(fm.description), source: 'skill', ...(fm['argument-hint'] ? { argumentHint: fm['argument-hint'] } : {}), _skill: true });
      } catch { /* no SKILL.md: skip */ }
    }
  }
  return found;
}

export function slashCommands(agent, { home, cwd, fs = nodeFs } = {}) {
  if (agent === 'codex') return CODEX_BUILTIN.map((r) => row(r, 'builtin')); // Codex has no custom-prompt discovery in 0.159.0
  if (agent !== 'claude') return [];
  const byName = new Map(CLAUDE_BUILTIN.map((r) => [r[0], row(r, 'builtin')]));
  const disc = discoverClaude({ home, cwd, fs });
  for (const d of disc) if (!d._skill) byName.set(d.name, d);
  for (const d of disc) if (d._skill) byName.set(d.name, d);
  for (const v of byName.values()) delete v._skill;
  return [...byName.values()];
}

// Prefix matches first, then substring; stable within each group. `typed` may include the leading "/".
export function filterCommands(list, typed = '') {
  const q = String(typed).replace(/^\//, '').toLowerCase();
  if (!q) return [...list];
  const pre = [], sub = [];
  for (const c of list) {
    const n = c.name.toLowerCase();
    if (n.startsWith(q)) pre.push(c); else if (n.includes(q)) sub.push(c);
  }
  return [...pre, ...sub];
}

// ---- models and efforts (known at KNOWN_AT) ----
// Claude: https://code.claude.com/docs/en/model-config.md aliases table. The 5.x full ids are the docs' examples
// (claude-opus-5-5, claude-fable-5-2) and this session's own id (claude-sonnet-5-5); no haiku id was confirmed.
const CLAUDE_MODELS = [
  { id: 'default', label: 'Default (clear override)', aliases: [] },
  { id: 'fable', label: 'Fable', aliases: ['claude-fable-5-2'] },
  { id: 'opus', label: 'Opus', aliases: ['best', 'claude-opus-5-5'] },
  { id: 'sonnet', label: 'Sonnet', aliases: ['claude-sonnet-5-5'] },
  { id: 'haiku', label: 'Haiku', aliases: [] },
  { id: 'sonnet[1m]', label: 'Sonnet (1M context)', aliases: [] },
  { id: 'opus[1m]', label: 'Opus (1M context)', aliases: [] },
  { id: 'opusplan', label: 'Opus plan, Sonnet execute', aliases: [] },
];
// Codex: codex-rs/models-manager/models.json at rust-v0.159.0, picker-visible models only.
const LMAX = ['low', 'medium', 'high', 'xhigh', 'max'];
const LULTRA = [...LMAX, 'ultra'];
const codexModel = (id, label, efforts, defaultEffort) => ({ id, label, aliases: [], efforts, defaultEffort });
const CODEX_MODELS = [
  codexModel('gpt-6-astra', 'GPT-6-Astra', LULTRA, 'low'),
  codexModel('gpt-6-sol', 'GPT-6-Sol', LULTRA, 'medium'),
  codexModel('gpt-6-luna', 'GPT-6-Luna', LMAX, 'medium'),
  codexModel('gpt-5.6-sol', 'GPT-5.6-Sol', LULTRA, 'low'),
  codexModel('gpt-5.6-terra', 'GPT-5.6-Terra', LULTRA, 'medium'),
  codexModel('gpt-5.6-luna', 'GPT-5.6-Luna', LMAX, 'medium'),
  codexModel('gpt-5.5', 'GPT-5.5', LMAX.slice(0, 4), 'medium'),
];

export function models(agent) {
  const src = agent === 'claude' ? CLAUDE_MODELS : agent === 'codex' ? CODEX_MODELS : [];
  return src.map((m) => ({ ...m, aliases: [...m.aliases], knownAt: KNOWN_AT }));
}

// Claude: model-config.md effort list; Opus/Sonnet 4.6 lack xhigh, and `auto` is accepted by /effort. Codex: per model, or the union.
export function efforts(agent, modelId) {
  if (agent === 'claude') return [...LMAX, 'auto'];
  if (agent !== 'codex') return [];
  const m = CODEX_MODELS.find((x) => x.id === modelId);
  return [...(m ? m.efforts : LULTRA)];
}

const noCtl = (s) => { if (/[\x00-\x1f\x7f]/.test(s)) throw new RangeError('control characters not allowed'); return s; };

// Claude row labels in the /model picker, by model id. `^Opus` skips the "Default (recommended) Opus" row.
const CLAUDE_ROW = { default: '^Default\\b', fable: '^Fable\\b', opus: '^Opus\\b', sonnet: '^Sonnet\\b', haiku: '^Haiku\\b', 'sonnet[1m]': '^Sonnet\\b.*1M', 'opus[1m]': '^Opus\\b.*1M', opusplan: '^Opus\\s*Plan\\b' };

// Signed Up/Down presses from the selected option to the first option whose label matches pattern: positive = Down. null = no such row.
export function pressesToRow(options, selected, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const at = options.findIndex((o) => re.test(o.label));
  const from = options.findIndex((o) => o.index === selected);
  return at < 0 || from < 0 ? null : at - from;
}

// Plan to switch model; the caller executes the steps against the live screen.
// Claude docs (code.claude.com/docs/en/model-config.md): "Typing `/model <name>` directly behaves like `Enter`" (saves the default),
// and "To switch for this session only, open the picker with `/model` and press `s` on the model's row." So Claude never gets `/model <alias>`.
// Codex 0.159 (model_popups.rs -> PersistModelSelection): picking in the /model popup always saves to config; no session-only path found.
export function modelControl(agent, id) {
  if (agent === 'claude') {
    const row = CLAUDE_ROW[id];
    if (!row) throw new RangeError(`unknown claude model ${id}`);
    return { agent, savesDefault: false, steps: [{ send: '/model', enter: true }, { waitPicker: 'model' }, { selectLabelMatching: row }, { key: 's' }], verify: { model: id } };
  }
  if (agent === 'codex') return { agent, savesDefault: true, steps: [{ send: id ? `/model ${noCtl(id)}` : '/model', enter: true }], verify: { model: id || null } };
  throw new RangeError(`unknown agent ${agent}`);
}

// ---- modes ----
// Claude: permission-modes.md table (Manual is the config value `default`).
const CLAUDE_MODES = [
  { id: 'default', label: 'Manual', description: 'Reads only run without asking' },
  { id: 'acceptEdits', label: 'Accept edits', description: 'Reads, file edits and common filesystem commands run without asking' },
  { id: 'plan', label: 'Plan', description: 'Reads only; explore before changing anything' },
  { id: 'auto', label: 'Auto', description: 'Everything runs, with background safety checks' },
  { id: 'dontAsk', label: "Don't ask", description: 'Pre-approved tools only; anything that would prompt is denied' },
  { id: 'bypassPermissions', label: 'Bypass permissions', description: 'Everything runs; isolated containers and VMs only' },
];
// Codex: plan/default are collaboration modes (Shift+Tab, keymap.rs:2468). The three presets are
// utils/approval-presets (ids read-only, auto, full-access); their descriptions below are assumed wording.
const CODEX_MODES = [
  { id: 'default', label: 'Default', description: 'Normal collaboration mode' },
  { id: 'plan', label: 'Plan', description: 'Plan before acting' },
  { id: 'read-only', label: 'Read Only', description: 'Read files only' }, // assumed
  { id: 'auto', label: 'Default permissions', description: 'Edit in the workspace, ask for the rest' }, // assumed
  { id: 'full-access', label: 'Full Access', description: 'No sandbox, no approvals' }, // assumed
];

export function modes(agent) {
  return (agent === 'claude' ? CLAUDE_MODES : agent === 'codex' ? CODEX_MODES : []).map((m) => ({ ...m }));
}

// Text/keys to move from one mode to another. '' when already there.
// Claude: the Shift+Tab count comes from the mapper's controls.setMode over the cycle
// default, acceptEdits, plan, [bypassPermissions], [auto]. The cycle only contains bypass/auto when the session
// enabled them: pass opts.bypass / opts.auto; each defaults to true when from or to is that mode.
// dontAsk is never in the cycle and throws RangeError.
export function modeControl(agent, from, to, opts = {}) {
  if (agent === 'claude') {
    if (from === to) return '';
    const o = { bypass: opts.bypass ?? (from === 'bypassPermissions' || to === 'bypassPermissions'), auto: opts.auto ?? (from === 'auto' || to === 'auto') };
    return dec(createClaudeMapper().controls.setMode(from, to, o));
  }
  if (agent === 'codex') {
    const ids = CODEX_MODES.map((m) => m.id);
    for (const m of [from, to]) if (!ids.includes(m)) throw new RangeError(`unknown codex mode ${m}`);
    if (from === to) return '';
    return codexControls.setMode(to);
  }
  throw new RangeError(`unknown agent ${agent}`);
}
