import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {installationId} from '../src/installation-id.mjs';

test('installation identity persists one UUID across concurrent CLI and desktop readers',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-identity-'));
 const values=await Promise.all(Array.from({length:20},()=>installationId(home)));
 assert.equal(new Set(values).size,1);assert.match(values[0],/^[0-9a-f-]{36}$/i);
 assert.equal((await readFile(resolve(home,'host-id'),'utf8')).trim(),values[0]);
 assert.deepEqual(await readdir(home),['host-id']);
 const existing='01234567-89ab-4cde-8fab-0123456789ab';await writeFile(resolve(home,'host-id'),existing);
 assert.equal(await installationId(home),existing);
});

test('an invalid saved identity is reported without silently replacing it',async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-invalid-identity-')),file=resolve(home,'host-id');await writeFile(file,'invalid');
 await assert.rejects(installationId(home),/installation ID is invalid/);assert.equal(await readFile(file,'utf8'),'invalid');
});
