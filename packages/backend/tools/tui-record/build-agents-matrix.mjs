// Builds variants/agents/MATRIX.json and RECORDS.txt from the .run-*.json logs and transcripts, then removes the logs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const D = fileURLToPath(new URL('../../test/fixtures/tui-real/claude/variants/agents/', import.meta.url));
const T = path.join(D, 'transcripts');
const jl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const recType = (o) => (o.type === 'attachment' ? `attachment:${o.attachment?.type}` : o.type);

// verdict per scenario: [right?, what]
const V = {
  'fg-tools': [true, 'one foreground agent: count 1, status ok, toolUses and tokens come from the result'],
  par2: [true, '2 agents, both ok, linked by meta.toolUseId'], par3: [true, '3 agents, all ok'], par5: [true, '5 agents, all ok'],
  'bg-complete': [false, 'background launch result (status async_launched) maps to status ok at once; never running; the later task-notification (completed, tool_uses, subagent_tokens, duration_ms) is not applied to the agent item; no totalToolUseCount in the launch result'],
  'bg-views': [false, 'same as bg-complete: background agent shown ok while still running'],
  'esc-kill': [false, 'agents stopped with Esc are shown ok; the stopped state is not recognised'],
  fail: [true, 'unknown subagent_type gives status error, toolUses 0; a normal agent gives ok'],
  perm: [true, '2 agents ok; the permission prompt is a terminal dialog outside the transcript'],
  types: [true, '4 agents (general-purpose, Explore, Plan, counter) with the right type names'],
  nested: [null, 'only one agent file was produced: the model did not spawn a grandchild, so nesting depth 2 is not verified'],
  question: [true, '1 agent ok; the question dialog is terminal only'],
  'long-resume': [true, '1 agent ok, toolUses 3'],
  subperm: [null, 'failed attempt: Bash permission dialog before any agent finished; no transcript compared'],
};
const NOTES = {
  'bg-views': 'footer tree shows main and the agent row with elapsed time and arrow count while running',
};
const rows = [];
const types = {}; // type -> {fields:Set, example}
const scrubEx = (v) => {
  if (typeof v === 'string') return v.length > 40 || /\s/.test(v) ? '<text>' : v;
  if (Array.isArray(v)) return v.slice(0, 2).map(scrubEx);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubEx(x)]));
  return v;
};
const scen = {}; // scenario -> {types:Set, fields:Set}
for (const f of fs.readdirSync(T).filter((f) => f.endsWith('.jsonl'))) {
  const s = f.split('.')[0]; const sub = f.includes('.agent-');
  for (const o of jl(path.join(T, f))) {
    const t = (sub ? 'subagent:' : 'parent:') + recType(o);
    const e = (types[t] ??= { fields: new Set(), example: null, n: 0 }); e.n++;
    for (const k of Object.keys(o)) e.fields.add(k);
    if (!e.example) e.example = o;
    const sc = (scen[s] ??= { types: new Set(), fields: new Set() });
    sc.types.add(t); if (o.toolUseResult) for (const k of Object.keys(o.toolUseResult)) sc.fields.add('toolUseResult.' + k);
    if (o.origin?.kind) sc.fields.add('origin.kind=' + o.origin.kind);
  }
}
for (const f of fs.readdirSync(D).filter((f) => f.startsWith('.run-'))) {
  const r = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
  const base = r.name.replace(/-acceptedits|-find/, '');
  const v = V[r.name] ?? V[base] ?? [null, 'no verdict'];
  const sc = scen[r.name];
  for (const c of r.captures) rows.push({ file: c.file, scenario: c.scenario, moment: c.moment, howTriggered: c.trigger, captured: true,
    recordTypes: sc ? [...sc.types].sort() : [], fieldNames: sc ? [...sc.fields].sort() : [],
    codeResultRight: v[0], codeResultNote: v[1], ...(NOTES[r.name] ? { observed: NOTES[r.name] } : {}) });
}
const nc = (name, why) => rows.push({ file: null, scenario: name, moment: null, howTriggered: why.trigger, captured: false, reason: why.reason, codeResultRight: null, codeResultNote: 'not captured' });
nc('agents-view-running', { trigger: 'type /agents while a background agent runs', reason: 'slash text stayed in the prompt while the agent ran; agents finish in 7-10 s' });
nc('esc-stop-result-screen', { trigger: 'Esc while agents run', reason: 'only the transcript state was recorded; see esc-kill captures for the screen' });
nc('nested-grandchild', { trigger: 'agent that spawns an agent', reason: 'the model produced only one agent file; no grandchild' });
nc('agents-dialog-created-agent', { trigger: 'custom agent definitions', reason: 'rule: never create agent definitions outside the scratch folder' });
rows.sort((a, b) => String(a.file).localeCompare(String(b.file)));
fs.writeFileSync(path.join(D, 'MATRIX.json'), JSON.stringify({ claudeVersion: '2.1.325', rows }, null, 1) + '\n');

const out = ['RECORD TYPES in parent and subagent transcripts (scrubbed; message text replaced by <text>)', ''];
for (const [t, e] of Object.entries(types).sort()) out.push(`${t}  (n=${e.n})`, '  fields: ' + [...e.fields].join(','), '  example: ' + JSON.stringify(scrubEx(e.example)).replace(/\/Users\/[^/"]+/g, '~'), '');
out.push('COMPLETION NOTICE (background agent finished)',
  '  record: type=user, origin={kind:task-notification,producer:session-task,runId}, promptSource=system, turnOrigin=task_notification',
  '  top-level fields: parentUuid,isSidechain,promptId,type,message,uuid,timestamp,permissionMode,origin,promptSource,turnOrigin,turnPosition,queueSkipAttachments,userType,entrypoint,cwd,sessionId,version,gitBranch',
  '  message: {role:"user", content:"<task-notification>..."} with tags task-id, tool-use-id, output-file, status, summary, note, result, usage(subagent_tokens, tool_uses, duration_ms)',
  '  example content: <task-notification><task-id>a1</task-id><tool-use-id>toolu_1</tool-use-id><output-file><text></output-file><status>completed</status><summary>Agent "<text>" finished</summary><result><text></result><usage><subagent_tokens>1205</subagent_tokens><tool_uses>5</tool_uses><duration_ms>9234</duration_ms></usage></task-notification>',
  '  also: queue-operation {type,operation:enqueue,timestamp,sessionId,content} carries the same text; the saved transcripts show message.content as "[scrubbed]".',
  '', 'BACKGROUND LAUNCH tool result toolUseResult keys: isAsync,status(async_launched),agentId,description,resolvedModel,prompt,outputFile,canReadOutputFile,canContinueAgent',
  'META file fields: agentType,isBuiltIn,description,toolUseId,spawnDepth,requestShape,requestNonInteractive,model,pickedEffortModel,finished', '');
fs.writeFileSync(path.join(D, 'RECORDS.txt'), out.join('\n'));
for (const f of fs.readdirSync(D).filter((f) => f.startsWith('.run-'))) fs.unlinkSync(path.join(D, f));
console.log(rows.length, 'rows', Object.keys(types).length, 'types');
