// Step-by-step view of saved CLI transcripts: per call, the phases (think/read/write/test/other), turns, time, cost.
// usage: node scripts/step-trace.mjs <run-dir>...   (dirs under ~/.cache/v4-transcripts/{pass,fail}/<arm>/<task>/)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST = /\b(test|pytest|jest|cargo|ctest|make|cmake|gradle|mvn|go (test|run|build)|node|python3?|c\+\+|g\+\+|javac|java)\b/;
export function phase(block) {
  if (block.type === 'thinking') return 'T';
  if (block.type !== 'tool_use') return null;
  const n = block.name;
  if (/^(Read|Glob|Grep|LS)$/.test(n)) return 'R';
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(n)) return 'W';
  if (n === 'Bash') return TEST.test(block.input?.command ?? '') ? 'X' : (/\b(cat|ls|head|sed -n|find|grep)\b/.test(block.input?.command ?? '') ? 'R' : 'B');
  return 'O';
}

export function traceCall(file) {
  const ev = readFileSync(file, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return {}; } });
  const steps = [];
  for (const e of ev) if (e.type === 'assistant') for (const b of e.message?.content ?? []) { const p = phase(b); if (p) steps.push(p); }
  const r = ev.find(e => e.type === 'result') ?? {};
  return { call: file.split('/').pop().replace('.jsonl', ''), steps: steps.join(''), turns: r.num_turns ?? null, sec: r.duration_ms ? +(r.duration_ms / 1000).toFixed(1) : null, usd: r.total_cost_usd ?? null, outTok: r.usage?.output_tokens ?? null };
}

export function traceRun(dir) {
  const calls = readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort((a, b) => parseInt(a) - parseInt(b)).map(f => traceCall(join(dir, f)));
  let row = {}; try { row = JSON.parse(readFileSync(join(dir, 'row.json'), 'utf8')); } catch {}
  return { task: row.task, pass: row.finalPass ?? null, calls };
}

if (process.argv[1]?.endsWith('step-trace.mjs')) for (const d of process.argv.slice(2)) console.log(JSON.stringify(traceRun(d)));

// self-check: phase classification
if (process.env.STEP_TRACE_SELFTEST) {
  const eq = (a, b) => { if (a !== b) throw new Error(`${a} !== ${b}`); };
  eq(phase({ type: 'tool_use', name: 'Bash', input: { command: 'python3 -m pytest -q' } }), 'X');
  eq(phase({ type: 'tool_use', name: 'Bash', input: { command: 'cat foo.py' } }), 'R');
  eq(phase({ type: 'tool_use', name: 'Edit' }), 'W');
  eq(phase({ type: 'thinking' }), 'T');
  console.log('step-trace selftest ok');
}
