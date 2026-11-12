import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {SufficeGate} from '../../../backend/assets/opencode-gate.js';

// Runs the plugin's tool.execute.before hook with SUFFICE_GATE_CMD set to a gate script whose body is `gateBody`.
async function runHook(gateBody, input={tool:'bash'}, output={args:{command:'echo hi'}}) {
  const dir=await mkdtemp(resolve(tmpdir(),'opencode-gate-'));
  try {
    const gate=resolve(dir,'gate.sh');
    await writeFile(gate,`#!/bin/sh\n${gateBody}\n`);
    const saved=process.env.SUFFICE_GATE_CMD;
    process.env.SUFFICE_GATE_CMD=`sh '${gate}'`;
    try {
      const plugin=await SufficeGate({});
      return await plugin['tool.execute.before'](input,output);
    } finally {
      if(saved===undefined) delete process.env.SUFFICE_GATE_CMD;
      else process.env.SUFFICE_GATE_CMD=saved;
    }
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
}

test('gate exit 2 rejects with the gate stderr', async () => {
  await assert.rejects(runHook(`echo 'suffice gate: no' >&2; exit 2`), {message:'suffice gate: no'});
});

test('gate exit 0 resolves', async () => {
  await runHook('exit 0');
});

test('gate receives the tool call JSON on stdin', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'opencode-gate-in-'));
  try {
    const seen=resolve(dir,'stdin.json');
    await runHook(`cat > '${seen}'; exit 0`);
    const {readFile}=await import('node:fs/promises');
    assert.equal(await readFile(seen,'utf8'),'{"tool_name":"bash","tool_input":{"command":"echo hi"}}');
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('unset SUFFICE_GATE_CMD rejects', async () => {
  const saved=process.env.SUFFICE_GATE_CMD;
  delete process.env.SUFFICE_GATE_CMD;
  try {
    const plugin=await SufficeGate({});
    await assert.rejects(plugin['tool.execute.before']({tool:'bash'},{args:{}}), {message:'suffice gate: hook unavailable'});
  } finally {
    if(saved!==undefined) process.env.SUFFICE_GATE_CMD=saved;
  }
});

test('a gate that hangs is killed and the call rejects', async () => {
  const started=Date.now();
  await assert.rejects(runHook('exec sleep 20'));
  assert.ok(Date.now()-started<12000, 'hook should reject within about 12s');
});
