import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {guard} from './electron-guard.mjs';

// Real hidden Electron page through webContents.debugger: snapshot, click and fill by ref, a stale ref after reload.
test('cdpBrowser drives a real hidden page by refs',{timeout:120000},async()=>{
 const srv=http.createServer((q,r)=>{r.setHeader('content-type','text/html');r.end('<title>t</title><button onclick="document.title=\'clicked\'">Save</button><input aria-label="Name" oninput="document.title=\'v:\'+this.value">');});
 await new Promise(f=>srv.listen(0,'127.0.0.1',f));const url=`http://127.0.0.1:${srv.address().port}/`;
 const env={...process.env,CDP_TEST_URL:url,SUFFICE_TEST_HIDE_WINDOW:'1'};delete env.ELECTRON_RUN_AS_NODE;
 try{
  const {stdout}=await promisify(execFile)(electronPath,[...guard,resolve('apps/desktop/test/computer-cdp-main.mjs'),'--user-data-dir='+await mkdtemp(resolve(tmpdir(),'suffice-cdp-'))],{env,timeout:90000});
  const out=JSON.parse(/^RESULT (.*)$/m.exec(stdout)[1]);
  assert.match(out.s,/button "Save"/);assert.equal(out.click.ok,true);assert.equal(out.fill.ok,true);
  assert.equal(out.title,'v:Bob');assert.deepEqual([out.stale.ok,out.stale.error],[false,'ref expired, re-snapshot']);
 }finally{srv.close();}
});
