// Expected classifyScreen kind per capture: [file, kind, picker title, picker entry count]
const C = 'chat', D = 'dashboard', M = 'menu', P = 'picker';
// [file, kind, picker title, picker entry count]
export const TABLE = [
  ['add-dir', D], ['advisor', P, 'Advisor (experimental)', 4], ['agents', C], ['autocompact', D], ['bash-mode', C],
  ['color', C], ['context', C], ['diff', C], ['effort', D], ['file-mention', C],
  ['help-commands', M], ['help-custom-commands', M], ['help-general', D], ['history-search', P, 'Search prompts · everywhere'],
  ['hooks', P, 'Hooks'], ['list-agents', C], ['mcp', P, 'Manage MCP servers'], ['memory-mode', C], ['memory', P, 'Memory'],
  ['mode-accept-edits', C], ['mode-auto', C], ['mode-manual', C], ['mode-plan', C], ['model', P, 'Select model', 5],
  ['narrow-60-help-general', D], ['narrow-60-model', P, 'Select model', 5], ['narrow-60-slash-popup', C],
  ['narrow-60-startup-banner', C], ['narrow-60-trust-dialog', 'trust'], ['output-style', C],
  ['permission-denied-result', C], ['permission-prompt', 'permission'],
  ['permissions-allow', M], ['permissions-ask', M], ['permissions-auto-mode', M], ['permissions-deny', M],
  ['permissions-recently-blocked', D], ['permissions-workspace', M],
  ['plugin', M], ['powerup', P, 'Power-ups 0/10 unlocked', 10], ['release-notes', P], ['resume', D],
  ['rewind-double-esc', P, 'Rewind'], ['rewind', P, 'Rewind'], ['sandbox', M], ['scroll-speed', D],
  ['settings-config', M], ['settings-stats-models', D], ['settings-stats', D], ['settings-status', D], ['settings-usage', D],
  ['shortcuts-help', C], ['skill-doctor', D], ['skills', P], ['slash-list', P], ['startup-banner', C], ['tasks', P, 'Background', 1],
  ['theme', P, 'Theme', 10], ['transcript-view', 'transcript-view'], ['trust-dialog', 'trust'], ['workflows', D],
];
