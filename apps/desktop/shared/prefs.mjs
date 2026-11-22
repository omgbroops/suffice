// Every preference the desktop has, in the order the settings page shows them.
// Shared by the host (defaults, validation, what reaches the harness) and the
// renderer (the settings page, and applying appearance and behaviour).
//
// Row kinds: toggle, select (options), segment (options), keys (read-only
// shortcut), info (read-only text). Rows marked `soon` belong to features the
// app does not have yet; the page shows them but they cannot be changed.

const toggle = (id, label, value = false, detail) => ({ kind: 'toggle', id, label, value, detail })
const select = (id, label, value, options, detail) => ({ kind: 'select', id, label, value, options, detail })
const soon = row => ({ ...row, soon: true })

export const SECTIONS = [
  {
    id: 'general',
    title: 'General',
    groups: [
      {
        title: 'Application',
        rows: [
          select('language', 'Language', 'System', ['System', 'English']),
          select('send', 'Send messages with', 'Enter', ['Enter', 'Ctrl + Enter'], 'Shift + Enter always starts a new line.'),
          toggle('startup', 'Launch at startup'),
          soon(toggle('tray', 'Keep running in the background', false, 'Closing the window keeps active agents running.')),
        ],
      },
      {
        title: 'Conversations',
        rows: [
          select('working-send', 'While the agent is working', 'Steer', ['Steer', 'Queue'], 'Steer redirects the current turn; Queue sends after it. Ctrl + Enter uses the other one.'),
          toggle('escape', 'Stop the agent with Escape', false, 'When no menu or dialog is open.'),
          select('naming', 'Thread naming', 'Automatic', ['Automatic', 'First message', 'Untitled']),
          select('new-project', 'New threads use', 'Last used project', ['Last used project', 'Ask each time']),
          soon(toggle('close-panel', 'Close the right panel with its last tab')),
        ],
      },
      { title: 'Privacy', rows: [toggle('private-labels', 'Hide sensitive details', false, 'Blur paths and account details while sharing your screen.')] },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    groups: [
      {
        title: 'Theme',
        rows: [
          { kind: 'segment', id: 'theme', label: 'Theme', value: 'Dark', options: ['System', 'Dark', 'Light'] },
          select('wallpaper', 'New session wallpaper', 'Pixel horizon', ['Pixel horizon', 'None'], 'The faint dithered picture behind the new session composer.'),
        ],
      },
      {
        title: 'Typography',
        rows: [
          select('interface-font', 'Interface font', 'Inter', ['Inter', 'Geist Mono', 'System']),
          select('code-font', 'Code font', 'Geist Mono', ['Geist Mono', 'System mono']),
          select('text-size', 'Text size', '13 px', ['12 px', '13 px', '14 px', '15 px']),
          select('density', 'Density', 'Comfortable', ['Comfortable', 'Compact']),
        ],
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    groups: [
      {
        title: 'Notify me',
        rows: [
          toggle('notify-finished', 'Agent finished', true),
          toggle('notify-approval', 'Approval needed', true),
          toggle('notify-failed', 'Agent ran into an error', true),
          toggle('notify-unfocused', 'Only when Suffice is in the background', true),
        ],
      },
      { title: 'Sound', rows: [toggle('notification-sound', 'Play a sound'), select('sound', 'Notification sound', 'Soft', ['Soft', 'Chime', 'Click'])] },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Shortcuts',
    groups: [
      {
        title: 'Conversations',
        rows: [
          { kind: 'keys', label: 'New session', value: 'Ctrl N' },
          { kind: 'keys', label: 'Send message', value: 'Enter' },
          { kind: 'keys', label: 'Send the other way while working', value: 'Ctrl Enter' },
          { kind: 'keys', label: 'New line', value: 'Shift Enter' },
          { kind: 'keys', label: 'Models and modes', value: 'Ctrl /' },
        ],
      },
      { title: 'Workspace', rows: [{ kind: 'keys', label: 'Toggle sidebar', value: 'Ctrl B' }, { kind: 'keys', label: 'Open settings', value: 'Ctrl ,' }] },
      { title: 'Navigation', rows: [{ kind: 'keys', label: 'Move in a menu', value: '↑ ↓' }, { kind: 'keys', label: 'Choose', value: 'Enter' }, { kind: 'keys', label: 'Close a menu, leave an attempt', value: 'Esc' }] },
    ],
  },
  {
    id: 'models',
    title: 'Models',
    groups: [
      {
        title: 'Defaults',
        rows: [
          select('default-model', 'Default model', 'Last used', ['Last used'], 'What a new session starts with.'),
          select('default-effort', 'Reasoning effort', 'Low', ['Low', 'Medium', 'High', 'Extra high'], 'For models you have not set an effort on.'),
        ],
      },
      { title: 'Shown in the picker', rows: [{ kind: 'models', id: 'disabled-models' }] },
    ],
  },
  { id: 'providers', title: 'Providers', groups: [{ title: 'Accounts', rows: [{ kind: 'providers' }] }] },
  { id: 'mcps', title: 'MCP servers', groups: [{ title: 'Servers', rows: [{ kind: 'resources', id: 'mcps' }] }] },
  { id: 'skills', title: 'Skills', groups: [{ title: 'Skills', rows: [{ kind: 'resources', id: 'skills' }] }] },
  { id: 'extensions', title: 'Extensions', groups: [{ title: 'Extensions', rows: [{ kind: 'resources', id: 'extensions' }] }] },
  { id: 'templates', title: 'Prompt templates', groups: [{ title: 'Templates', rows: [{ kind: 'resources', id: 'templates' }] }] },
  {
    id: 'agent',
    title: 'Agent behavior',
    groups: [
      {
        title: 'Execution',
        rows: [
          select('execution-shell', 'Command shell', 'System default', ['Native Bash', 'PowerShell', 'System default']),
          toggle('allow-network', 'Browser and desktop tools', true, 'Lets the agent drive a browser and native apps. Shell commands keep network access either way.'),
          soon(toggle('background-agents', 'Allow background agents', true)),
        ],
      },
      {
        title: 'Transcript',
        rows: [
          toggle('collapse-work', 'Collapse completed actions', true),
          toggle('show-reasoning', 'Show reasoning', true),
          toggle('stream-markdown', 'Render Markdown while streaming', true),
        ],
      },
    ],
  },
  {
    id: 'context',
    title: 'Context and memory',
    groups: [
      {
        title: 'Context window',
        rows: [
          toggle('auto-compact', 'Automatic compaction', true),
          select('compact-at', 'Compact at', '80%', ['70%', '80%', '90%']),
          soon(toggle('context-ring', 'Show context usage', true)),
        ],
      },
      {
        title: 'Repository context',
        rows: [
          toggle('project-instructions', 'Read project instructions', true, 'AGENTS.md and similar files in the project.'),
          toggle('git-context', 'Include Git status', true, 'The branch and changed files, sent with each new session.'),
          toggle('remember-context', 'Remember project context', false, 'Start new sessions with the last reply from this project.'),
        ],
      },
    ],
  },
  {
    id: 'projects',
    title: 'Projects and Git',
    groups: [
      { title: 'Projects', rows: [toggle('restore-project', 'Restore the last project', true), soon(select('project-open', 'Open projects in', 'Current window', ['Current window', 'New window']))] },
      {
        title: 'Git',
        rows: [
          toggle('signoff', 'Ask the agent to sign off commits'),
          toggle('confirm-push', 'Confirm git pushes', true, 'Asks before a git push, even on Full access.'),
          soon(select('worktree-location', 'Worktree location', 'Default', ['Default', 'Custom location'])),
        ],
      },
    ],
  },
  {
    id: 'files',
    title: 'Files and editor',
    groups: [
      {
        title: 'Explorer',
        rows: [soon(toggle('hidden-files', 'Show hidden files', true)), soon(toggle('gitignored', 'Show ignored files')), soon(toggle('file-icons', 'Show file-type icons', true)), soon(select('file-sort', 'Sort files by', 'Name', ['Name', 'Type', 'Modified']))],
      },
      {
        title: 'Editor',
        rows: [soon(toggle('wrap-lines', 'Wrap long lines')), soon(toggle('line-numbers', 'Line numbers', true)), soon(select('tab-size', 'Tab size', '2 spaces', ['2 spaces', '4 spaces', '8 spaces'])), soon(select('diff-layout', 'Default diff view', 'Unified', ['Unified', 'Split']))],
      },
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal',
    groups: [
      {
        title: 'Shell',
        rows: [soon(select('terminal-shell', 'Default shell', 'System default', ['Native Bash', 'PowerShell', 'System default'])), soon(select('working-directory', 'Working directory', 'Thread project', ['Thread project', 'Home directory'])), soon(toggle('restore-terminal', 'Restore terminal tabs', true))],
      },
      {
        title: 'Appearance',
        rows: [soon(select('terminal-font', 'Font', 'Geist Mono', ['Geist Mono', 'System mono'])), soon(select('terminal-size', 'Font size', '12 px', ['11 px', '12 px', '13 px', '14 px'])), soon(select('cursor', 'Cursor', 'Bar', ['Bar', 'Block', 'Underline'])), soon(toggle('cursor-blink', 'Blink cursor', true))],
      },
      { title: 'History', rows: [soon(select('scrollback', 'Scrollback', '5,000 lines', ['1,000 lines', '5,000 lines', '10,000 lines']))] },
    ],
  },
  { id: 'archived', title: 'Archived', groups: [{ title: 'Archived threads', rows: [{ kind: 'archived', id: 'archived' }] }] },
  {
    id: 'privacy',
    title: 'Data and privacy',
    groups: [
      {
        title: 'On this device',
        rows: [
          select('history-retention', 'Keep conversation history', 'Until deleted', ['Until deleted', '90 days', '30 days'], 'Older sessions go to the Recycle Bin when Suffice starts.'),
          soon(toggle('save-attachments', 'Keep attached files', true)),
          soon(toggle('diagnostics', 'Save local diagnostics')),
        ],
      },
      { title: 'Data', rows: [{ kind: 'action', id: 'export', label: 'Export conversations', value: 'Export…', detail: 'Copies every session file to a folder you choose.' }, soon({ kind: 'action', id: 'clear-cache', label: 'Clear cached previews', value: 'Clear' })] },
    ],
  },
  { id: 'about', title: 'About', groups: [{ title: 'Suffice', rows: [{ kind: 'about' }] }] },
]

const ROWS = SECTIONS.flatMap(s => s.groups.flatMap(g => g.rows)).filter(r => r.id && 'value' in r)

/** Default for every preference with a value. */
export const PREF_DEFAULTS = { ...Object.fromEntries(ROWS.map(r => [r.id, r.value])), 'disabled-models': [], archived: [] }

/** Keep only known preferences with values of the right shape. */
export function cleanPrefs(input) {
  const out = {}
  for (const [id, v] of Object.entries(input ?? {})) {
    const row = ROWS.find(r => r.id === id)
    if (id === 'disabled-models' || id === 'archived') {
      if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[id] = v.slice(0, 5000)
    } else if (id === 'default-model') {
      if (typeof v === 'string' && v.length < 200) out[id] = v
    } else if (row?.kind === 'toggle') {
      if (typeof v === 'boolean') out[id] = v
    } else if (row?.options?.includes(v)) out[id] = v
  }
  return out
}

/** Preferences from the old desktop app's settings file, where they mean the same thing here. */
export function fromOldDesktop(old) {
  if (!old || typeof old !== 'object') return {}
  const renamed = { mode: 'theme', finished: 'notify-finished', approval: 'notify-approval', failed: 'notify-failed', unfocused: 'notify-unfocused' }
  const out = {}
  for (const [k, v] of Object.entries(old)) out[renamed[k] ?? k] = v
  if (Array.isArray(old['disabled-models'])) out['disabled-models'] = old['disabled-models'].map(k => String(k).replace(/^openai\|/, ''))
  delete out.archived
  return cleanPrefs(out)
}
