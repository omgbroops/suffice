import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stateDir, root } from '../src/runtime.mjs';

const campaigns = process.argv.slice(2);
if (!campaigns.length || campaigns.some(c => !/^[a-zA-Z0-9_-]+$/.test(c))) throw new Error('Supply valid campaign names.');
const rows = [];
for (const campaign of campaigns) {
  const directory = resolve(stateDir, 'runs', campaign);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let events, result;
    try {
      events = (await readFile(resolve(directory, entry.name, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
      result = JSON.parse(await readFile(resolve(directory, entry.name, 'result.json'), 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const injected = new Set(); let duplicateReads = 0, plannedMentions = 0, code = '';
    for (const event of events) {
      if (event.type === 'assistant') code = (event.content ?? []).filter(c => c.type === 'toolCall' && c.name === 'codemode').map(c => c.arguments?.code ?? '').join('\n');
      if (event.type === 'watcher_decision' && event.injected) {
        const candidate = event.candidates.find(c => c.id === event.selectedId);
        if (candidate) { injected.add(candidate.path); if (code.includes(candidate.path)) plannedMentions++; }
      }
      if (event.type === 'tool' && event.name === 'file_read' && injected.has(event.args.path)) { duplicateReads++; injected.delete(event.args.path); }
      if (event.type === 'tool' && ['file_write', 'file_edit'].includes(event.name)) injected.delete(event.args.path);
    }
    const requests = events.filter(e => e.type === 'request_shape');
    rows.push({ campaign, runId: result.runId, task: result.task, variant: result.variant, success: result.success,
      injected: result.decisions.filter(d => d.injected).length, duplicateReadsAfterInjection: duplicateReads,
      injectedPathsMentionedInCurrentProgram: plannedMentions, prefixRegressions: events.filter(e => e.type === 'context' && !e.prefixPreserved).length,
      distinctToolSchemas: new Set(requests.map(r => r.toolsHash)).size,
      initialPromptChars: events.find(e => e.type === 'initial')?.promptChars,
      mainCalls: result.turns, mainTokens: result.usage.totalTokens, status: result.status });
  }
}
await mkdir(resolve(root, 'reports'), { recursive: true });
const file = resolve(root, 'reports', 'trace-inspection.json');
await writeFile(file, JSON.stringify({ at: new Date().toISOString(), caveat: 'A path mentioned in a tool program is a duplication signal, not proof of a future read.', rows }, null, 2));
console.log(JSON.stringify(rows, null, 2));
