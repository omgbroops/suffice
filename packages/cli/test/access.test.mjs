import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {parseOptions} from '../src/options.mjs';
import {repositoryTools} from '../src/tools.mjs';

const NAVIGATION=['symbols','symbol_read','symbol_references'];

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
