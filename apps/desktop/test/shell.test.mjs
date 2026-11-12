import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWindowsBash} from '../../../packages/cli/src/shell.mjs';
test('Windows shell selection works without ProgramFiles and never falls back to WSL',()=>{
 const git='C:\\Program Files\\Git\\bin\\bash.exe';
 assert.equal(resolveWindowsBash({PATH:'C:\\Windows\\System32'},path=>path===git),git);
 assert.throws(()=>resolveWindowsBash({PATH:'C:\\Windows\\System32'},()=>false),/will not fall back/);
});
