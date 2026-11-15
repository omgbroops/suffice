#!/usr/bin/env node
// suffice-flow run <workflow> --args <json> [--runner fake|pi|cmd:<binary>] [--data <dir>] | list | show <runId> | resume <runId> | cancel <runId>
import os from 'node:os';
import path from 'node:path';
import { createBackend } from '../src/app/backend.mjs';
import { createPiRunner } from '../src/app/pi-runner.mjs';
import { createExec, createFakeRunner, createCommandRunner } from '../src/runner/index.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv.splice(i, 2)[1]; };
const dataDir = flag('data') ?? path.join(os.homedir(), '.suffice-flow');
const runnerOpt = flag('runner') ?? 'fake';
const argsJson = flag('args');
const [cmd, target] = argv;
const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);

const exec = createExec();
const runnerFor = (spec) => {
  if (spec === 'fake') return createFakeRunner(() => ({ ok: true, text: 'ok' }));
  if (spec.startsWith('cmd:') && spec.length > 4) return createCommandRunner({ exec, command: spec.slice(4), timeoutMs: 600000 });
  if (spec === 'pi') {
    // the real session; its model/runtime options are supplied by the app, so this uses the session defaults
    const createSession = async (req) => (await import('../../cli/src/session.mjs')).createSufficeSession({ cwd: req.cwd });
    return createPiRunner({ createSession, timeoutMs: 600000 });
  }
  throw new Error(`--runner: expected fake, pi or cmd:<binary>, got "${spec}"`);
};

try {
  const r = runnerFor(runnerOpt);
  const b = createBackend({ dataDir, exec, approve: async () => false, runners: { default: r } });
  if (cmd === 'run') {
    if (!target) throw new Error('usage: run <workflow> --args <json>');
    const id = b.startRun(target, argsJson ? JSON.parse(argsJson) : {});
    out({ runId: id, result: await b.wait(id) });
  } else if (cmd === 'resume') {
    if (!target) throw new Error('usage: resume <runId>');
    await b.resumeRun(target);
    out({ runId: target, result: await b.wait(target) });
  } else if (cmd === 'list') out(await b.listRuns());
  else if (cmd === 'show') {
    if (!target) throw new Error('usage: show <runId>');
    out(await b.events(target));
  } else if (cmd === 'cancel') {
    if (!target) throw new Error('usage: cancel <runId>');
    out({ runId: target, cancelled: b.cancelRun(target) }); // only runs started by this process can be cancelled
  } else throw new Error('usage: suffice-flow run|list|show|resume|cancel');
  await b.dispose();
  process.exit(0);
} catch (e) {
  out({ error: e.message });
  process.exit(1);
}
