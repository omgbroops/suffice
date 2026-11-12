import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile, readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {parseOptions} from '../src/options.mjs';
import {repositoryTools} from '../src/tools.mjs';

const NAVIGATION=['symbols','symbol_read','symbol_references'];

// Runs one bash call through the native tool with SUFFICE_GATE_CMD set to a gate script whose body is `gateBody`.
async function runGatedBash(dir, gateBody, command) {
  const gate=resolve(dir,'gate.sh');
  await writeFile(gate,`#!/bin/sh\n${gateBody}\n`);
  const saved=process.env.SUFFICE_GATE_CMD;
  process.env.SUFFICE_GATE_CMD=`sh '${gate}'`;
  try {
    const bash=repositoryTools({workspace:dir,access:'full'}).find(t=>t.name==='bash');
    return await bash.execute('call-1',{command});
  } finally {
    if(saved===undefined) delete process.env.SUFFICE_GATE_CMD;
    else process.env.SUFFICE_GATE_CMD=saved;
  }
}

test('--access defaults to full and accepts read/edit/full', () => {
  assert.equal(parseOptions([],{}).access,'full');
  for(const level of ['read','edit','full']) assert.equal(parseOptions(['--access',level],{}).access,level);
});

test('--access rejects unknown values and missing values', () => {
  assert.throws(()=>parseOptions(['--access','admin'],{}),/Invalid access/);
  assert.throws(()=>parseOptions(['--access'],{}),/Missing value for --access/);
});

test('repositoryTools returns the expected tool names per access level', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-access-'));
  try {
    const names=access=>repositoryTools({workspace:dir,access}).map(t=>t.name).sort();
    assert.deepEqual(names('read'),['read',...NAVIGATION].sort());
    assert.deepEqual(names('edit'),['edit','read','write',...NAVIGATION].sort());
    assert.deepEqual(names('full'),['bash','edit','read','write',...NAVIGATION].sort());
    assert.deepEqual(names(undefined),names('full'));
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('repositoryTools throws on an unknown access level', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-access-'));
  try {
    assert.throws(()=>repositoryTools({workspace:dir,access:'admin'}),/Unknown access level/);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('bash execute is blocked by a gate exiting 2 and the command never runs', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-gate-'));
  try {
    const marker=resolve(dir,'marker');
    await assert.rejects(runGatedBash(dir,`echo 'suffice gate: no' >&2\nexit 2`,`touch '${marker}'`),{message:'suffice gate: no'});
    assert.equal(existsSync(marker),false);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('bash execute runs the command when the gate exits 0', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-gate-'));
  try {
    const marker=resolve(dir,'marker');
    await runGatedBash(dir,'exit 0',`touch '${marker}'`);
    assert.equal(existsSync(marker),true);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('the gate receives the Bash tool call as JSON on stdin', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-gate-'));
  try {
    const seen=resolve(dir,'stdin.json');
    const command=`echo "hi" && printf '%s' 'a"b'`;
    await runGatedBash(dir,`cat > '${seen}'\nexit 0`,command);
    assert.deepEqual(JSON.parse(await readFile(seen,'utf8')),{tool_name:'Bash',tool_input:{command}});
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('bash execute is unchanged when SUFFICE_GATE_CMD is unset', async () => {
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-cli-gate-'));
  const saved=process.env.SUFFICE_GATE_CMD;
  delete process.env.SUFFICE_GATE_CMD;
  try {
    const marker=resolve(dir,'marker');
    const bash=repositoryTools({workspace:dir,access:'full'}).find(t=>t.name==='bash');
    await bash.execute('call-1',{command:`touch '${marker}'`});
    assert.equal(existsSync(marker),true);
  } finally {
    if(saved!==undefined) process.env.SUFFICE_GATE_CMD=saved;
    await rm(dir,{recursive:true,force:true});
  }
});
