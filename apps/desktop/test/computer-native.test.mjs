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
