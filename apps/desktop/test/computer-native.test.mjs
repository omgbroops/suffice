import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createComputer} from '../electron/computer-ipc.mjs';

// A native app target runs the desktop surface through the ax-snapshot adapter (fake exec), not CDP.
test('computer-start with app drives nativeDesktop and presses by ref',{timeout:30000},async()=>{
 const c=createComputer({dataDir:await mkdtemp(resolve(tmpdir(),'suffice-cu-native-')),env:{SUFFICE_COMPUTER_FAKE:'1'},send(){}});
 const {runId}=await c.handlers['computer-start']({goal:'make a note',app:'Notes'});
 let d;for(let i=0;i<100;i++){d=c.handlers['computer-detail'](runId);if(d.state!=='running')break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(d.state,'done');assert.equal(d.start,'Notes');assert.equal(d.answer,'Pressed New Note');
 assert.equal(d.steps[0].action,'click');
});

test('missing ax-snapshot binary gives a clear message, not ENOENT',{timeout:30000},async()=>{
 const c=createComputer({dataDir:await mkdtemp(resolve(tmpdir(),'suffice-cu-nobin-')),env:{SUFFICE_AX_BIN:resolve(tmpdir(),'no-such-ax-snapshot')},send(){}});
 await assert.rejects(c.handlers['computer-start']({goal:'make a note',app:'Notes'}),e=>/Native control unavailable/.test(e.message)&&!/ENOENT/.test(e.message));
});

test('build-ax-snapshot.sh produces a binary',{timeout:240000,skip:process.platform!=='darwin'},async()=>{
 const {execFileSync}=await import('node:child_process'),{existsSync}=await import('node:fs');
 const out=resolve(await mkdtemp(resolve(tmpdir(),'suffice-ax-build-')),'ax-snapshot');
 execFileSync('sh',[new URL('../native/build-ax-snapshot.sh',import.meta.url).pathname,out]);
 assert.ok(existsSync(out));
});
