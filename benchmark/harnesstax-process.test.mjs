import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startActor,stopActor} from './harnesstax-process.mjs';

test('timeout stop terminates actor and its descendant group before returning',{skip:process.platform==='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'harnesstax-process-'));
  const pidFile=join(dir,'actor.pid'),descendantFile=join(dir,'descendant.pid');
  const code=`const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(descendantFile)},String(c.pid));setInterval(()=>{},1000);`;
  const running=startActor(process.execPath,['-e',code],pidFile);
  try {
    let descendant;
    for(let i=0;i<200;i++) {
      descendant=await readFile(descendantFile,'utf8').catch(()=>null);
      if(descendant)break;
      await new Promise(r=>setTimeout(r,10));
    }
    assert.ok(descendant,'fixture descendant started');
    await stopActor(pidFile);
    assert.equal(await running,1);
    for(const pid of [Number(await readFile(pidFile,'utf8')),Number(descendant)]) {
      const stat=await readFile(`/proc/${pid}/stat`,'utf8').catch(()=>null);
      assert.ok(stat===null||stat.split(') ')[1].startsWith('Z '),'process must be gone or non-executing zombie');
    }
  } finally {await stopActor(pidFile);await running;await rm(dir,{recursive:true,force:true});}
});

test('normal actor exit code is preserved',{skip:process.platform==='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'harnesstax-exit-'));
  try {assert.equal(await startActor(process.execPath,['-e','process.exit(7)'],join(dir,'actor.pid')),7);}
  finally {await rm(dir,{recursive:true,force:true});}
});
