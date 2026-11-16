// Synthetic chat corpus for history-scale tests. CLI: node history-gen.mjs <home> <count> [bigEvery]
import fs from 'node:fs';
import path from 'node:path';

const T = (n) => new Date(1_700_000_000_000 + n * 1000).toISOString();
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa'];
export const promptFor = (i) => `fix ${WORDS[i % 16]} ${WORDS[(i * 7 + 3) % 16]} handler number ${i}`;
const fill = (kb) => Buffer.from(`${JSON.stringify({ type: 'assistant', uuid: 'x', message: { content: [{ type: 'text', text: 'y'.repeat(1000) }] } })}\n`.repeat(Math.max(1, kb)));

/** bigEvery: every Nth file gets 5 MB of trailing records. headKB: every file gets this much filler after the first records. headless: all claude files are sdk-cli. */
export function genCorpus(home, count, { bigEvery = 0, headKB = 0, headless = false } = {}) {
  const big = fill(1024), mid = headKB ? fill(headKB) : null;
  for (let i = 0; i < count; i++) {
    const codex = i % 4 === 3, sub = !codex && i % 10 === 5, sdk = !codex && (headless || i % 13 === 0);
    const f = codex
      ? path.join(home, '.codex/sessions/2026/11', `d${i % 30}`, `rollout-2026-11-01T00-00-00-${String(i).padStart(8, '0')}-0000-0000-0000-000000000000.jsonl`)
      : path.join(home, '.claude/projects', `-proj-${i % 200}`, `${sub ? 'subagents/' : ''}s${i}.jsonl`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    let text = promptFor(i);
    if (i % 19 === 0) text = `${text}\n${'long line '.repeat(500)}`; // multi-line, longer than the title and summary caps
    if (i % 29 === 0) text = `ünïcode ${text} 日本語`;
    const lead = [];
    if (i % 23 === 0) lead.push('not json {{{'); // malformed line before the real records
    if (i % 17 === 0) lead.push(codex
      ? { type: 'response_item', timestamp: T(i), payload: { type: 'message', role: 'user', content: [{ text: '<env>skip me</env>' }] } }
      : { type: 'user', uuid: 'sys', timestamp: T(i), cwd: `/work/p${i % 200}`, message: { content: '<command-name>x</command-name>' } });
    const head = codex
      ? [{ type: 'session_meta', payload: { id: `c${i}`, cwd: `/work/p${i % 200}`, timestamp: T(i), source: 'cli' } }, ...lead,
        { type: 'response_item', timestamp: T(i + 1), payload: { type: 'message', role: 'user', content: [{ text }] } }]
      : [...lead, { type: 'user', uuid: 'u', timestamp: T(i), cwd: i % 31 === 0 ? undefined : `/work/p${i % 200}`, entrypoint: sdk ? 'sdk-cli' : 'cli', ...(sub ? { isSidechain: true } : {}), message: { content: text } },
        { type: 'assistant', uuid: 'a', timestamp: T(i + 1), message: { content: [{ type: 'text', text: 'ok' }] } }];
    const fd = fs.openSync(f, 'w');
    fs.writeSync(fd, head.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n') + '\n');
    if (mid) fs.writeSync(fd, mid);
    if (bigEvery && i % bigEvery === 0) for (let b = 0; b < 5; b++) fs.writeSync(fd, big);
    fs.closeSync(fd);
    fs.utimesSync(f, 1_700_000_000 + i, 1_700_000_000 + i);
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) genCorpus(process.argv[2], +process.argv[3], { bigEvery: +(process.argv[4] ?? 1000) });
