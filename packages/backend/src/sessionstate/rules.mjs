// Per-agent screen rules. Only the last TAIL lines of the screen are matched.
// Origins: wording recalled from each TUI (not captured from a run); `--help` of the installed CLIs has no prompt text. Guesses are marked.
export const TAIL = 15;

export const rules = {
  generic: {
    permission: [/\(y\/n\)|\[y\/n\]|\[Y\/n\]|\[y\/N\]/i], // classic confirmation suffix; guess for unknown agents
    working: [],
    error: [],
  },
  claude: {
    permission: [
      /Do you want to (?:proceed|make this edit|create|overwrite|allow)\b/, // Claude Code tool dialog title (recalled)
      /Yes, and (?:don't|do not) ask again/, // second option of the same dialog (recalled)
      /Is this a project you created or one you trust\?/, // folder trust dialog (captured from a real run, 2026-11-15)
      /Yes, I trust this folder/, // its second option (captured from a real run, 2026-11-15)
    ],
    working: [/esc to interrupt/i], // spinner hint line (recalled)
    error: [/^\s*(?:⎿\s*)?API Error\b/], // API failure line (recalled, guess)
  },
  codex: {
    permission: [
      /Would you like to run the following command\?/, // Codex exec approval title (recalled)
      /Allow Codex to apply proposed code changes\?/, // Codex patch approval title (recalled)
      /No, and tell Codex what to do differently/, // last option of both (recalled)
    ],
    working: [/esc to interrupt/i], // "Working (12s • esc to interrupt)" status (recalled)
    error: [/^\s*■\s/], // Codex error cell prefix (guess)
  },
  opencode: {
    permission: [
      /Permission required/, // opencode permission dialog title (guess)
      /Allow once/, // option labels (guess)
      /Allow always/, // option labels (guess)
    ],
    working: [/esc interrupt/i], // footer hint while busy (guess)
    error: [],
  },
};

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

export function tailLines(text) {
  const ls = String(text ?? '').replace(ANSI, '').split('\n').map((l) => l.trimEnd());
  while (ls.length && !ls[ls.length - 1]) ls.pop();
  return ls.slice(-TAIL);
}

export function classifyScreen(agent, text) {
  const ls = tailLines(text);
  const set = (k) => [...(rules[agent]?.[k] ?? []), ...rules.generic[k]];
  const hit = (k) => ls.some((l) => set(k).some((r) => r.test(l)));
  const at = ls.findLastIndex((l) => set('permission').some((r) => r.test(l)));
  // after = non-blank lines below the last approval-prompt line; growth means output was printed under a dismissed dialog
  return { blank: ls.length === 0, permission: at >= 0, after: at >= 0 ? ls.slice(at + 1).filter(Boolean).length : 0, working: hit('working'), error: hit('error') };
}
